# Authentication

SignalRoom uses **Supabase Auth** (spec §8): email + password as the primary
method, plus magic link, OAuth (Google / GitHub / Microsoft), and SAML/OIDC SSO
that are pre-wired and appear the moment you enable them. When Supabase env is
absent the app runs in an open **demo** mode so the public Vercel demo stays
usable. Cross-reference: [INTEGRATIONS.md §1 Supabase](INTEGRATIONS.md).

## Two modes, one contract

The whole app codes against `useAuth()` from `src/lib/auth/AuthProvider.tsx`
(the fixed interface lives in `src/lib/auth/types.ts`). The provider picks a
mode from the public env:

| Condition | `mode` | Behaviour |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` **and** `NEXT_PUBLIC_SUPABASE_ANON_KEY` set | `supabase` | Real Supabase Auth. `middleware.ts` refreshes the session and redirects unauthenticated requests to `/login`. |
| Either missing | `demo` | No network. A local session in `localStorage["sr-demo-auth"]`. Middleware passes everything through — the demo stays open. |

### The enforcement rule

`middleware.ts` runs on every non-asset request:

- **Configured:** it calls `supabase.auth.getUser()` (which refreshes the
  session cookie) and, if there is no user and the path isn't public, redirects
  to `/login?next=<path>`. Public paths: `/login`, `/auth/*` (the callback),
  `/api/ingest/*` (webhooks authenticate with `x-ingest-key`, not a session),
  and static assets.
- **Not configured:** it returns immediately — no redirect, no cookie work.

So enforcement turns on **automatically** the moment you add the Supabase env
vars; nothing else changes.

## Demo credential (the deployed demo)

In demo mode the login page shows a fixed credential:

```
email:    owner@signalroom.app
password: Signal-Room-DH3MCCKk
```

Demo sign-in is deliberately forgiving: the fixed pair signs you in as an
**owner**, and *any* valid-looking email with a password of ≥ 6 characters signs
you in as an **operator** (name derived from the email). There is also a
`demoSignIn(role?)` shortcut behind the login page's "Continue to demo" button
that drops you straight in as any role. Magic link / OAuth / SSO return a soft
message — "Configure Supabase to enable this sign-in method." — because they
need a real backend.

## Enable real auth

### 1. Email + password (default)

Set the two `NEXT_PUBLIC_SUPABASE_*` vars (+ `SUPABASE_SERVICE_ROLE_KEY`, server
only) from Project Settings → API. Email+password is **on by default** in
Supabase Auth — no dashboard toggle needed. Magic link uses the same email
provider; enable it under Auth → Providers → Email if you want passwordless too.

### 2. Add the first owner

Either the Supabase dashboard (Auth → Users → Add user, tick "Auto Confirm") or
the bundled script:

```bash
# needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your env
node scripts/create-user.mjs                    # owner@signalroom.app + the demo password
node scripts/create-user.mjs you@campaign.org 'Str0ng-Pass'
```

The script uses the service-role Admin API and **refuses to run** without
`SUPABASE_SERVICE_ROLE_KEY`.

Then grant a role by inserting into `campaign_members`:

```sql
insert into campaign_members (user_id, campaign_id, role)
values ('<auth-user-id>', '<campaign-id>', 'owner');   -- owner | operator | client_viewer
```

## Roles

`campaign_members.role` is the source of truth: `owner` / `operator` /
`client_viewer`. The SQL helper `current_app_role()` (migration
`0004_auth.sql`) returns the **highest** role the session user holds across
their campaigns (owner > operator > client_viewer), defaulting to `operator`
for a bootstrapped first user with no membership yet. The AuthProvider calls it
via RPC and maps the DB value to the app role:

| DB (`campaign_members.role`) | App (`AuthRole`) |
|---|---|
| `owner` | `owner` |
| `operator` | `operator` |
| `client_viewer` | `client` |

Unknown/absent → `operator`. Migration `0004_auth.sql` also creates a
`profiles` table (a display mirror of `auth.users`, populated by an
`on_auth_user_created` trigger, readable only by the owning user).

> Briefing / alert recipients do **not** need accounts (M3) — they're plain
> addresses in `alert_rules.channels`.

## Pre-fitting SSO

SSO buttons render only when their public flag is `true` (see `.env.example`).
The provider secrets always live in the **Supabase dashboard**, never in this
repo.

### OAuth — Google / GitHub / Microsoft (Azure)

1. Supabase dashboard → **Auth → Providers** → enable the provider and paste its
   client id / secret (from the provider's own console).
2. Set the app flag so the button appears:
   - Google → `NEXT_PUBLIC_AUTH_GOOGLE=true`
   - GitHub → `NEXT_PUBLIC_AUTH_GITHUB=true`
   - Microsoft/Azure → `NEXT_PUBLIC_AUTH_AZURE=true`
3. The button calls `signInWithOAuth(provider)`, which redirects to the provider
   and back to `/auth/callback`.

### SAML / OIDC SSO (enterprise)

1. Supabase dashboard → **Auth → SSO** → add the SAML/OIDC identity provider and
   register the customer's email **domain**.
2. Set `NEXT_PUBLIC_AUTH_SAML=true` to show the SSO entry.
3. The UI calls `signInWithSSO(domain)` (e.g. `acme.org`); Supabase resolves the
   domain to its IdP and returns a redirect URL to start the SAML flow. On
   success the IdP posts back to `/auth/callback`.

## Passkeys (WebAuthn)

Passkeys are a **primary passwordless** method (Supabase Auth, experimental):
the browser's authenticator (Touch ID / Windows Hello / a hardware key / a phone)
proves who you are — no password, no email round-trip.

### How it works

- **Sign in** uses a *discoverable credential*: the login page shows a
  **"Sign in with a passkey"** button that calls `signInWithPasskey()` with **no
  email or username** — the authenticator offers whichever passkeys are registered
  for this site. On success a `SIGNED_IN` event fires and the existing
  `onAuthStateChange` handler updates `user` (no manual session handling).
- **Register while signed in:** you must be authenticated first, so registration
  lives in the app shell, not on the login page. The sidebar user block shows a
  **"Set up a passkey"** action (real Supabase users only) that calls
  `registerPasskey()` and toasts success or the returned error. So the order is
  always **sign in once (password/OAuth) → register a passkey → thereafter sign in
  with the passkey**.
- Demo mode returns a soft **"Connect Supabase to enable passkeys."** — WebAuthn
  needs a real backend and a registered relying party.

> **SSO users can't register passkeys.** This is a Supabase limitation: accounts
> created through SAML/OIDC SSO cannot enrol a passkey.

### Enabling it

1. **Supabase dashboard → Authentication → Passkeys** → enable, and set:
   - **Relying Party ID** to the bare domain `signal-room-rho.vercel.app`
     (no scheme, no path).
   - **RP origins** to `https://signal-room-rho.vercel.app`.
2. In **Vercel**, set `NEXT_PUBLIC_AUTH_PASSKEY=true` and **redeploy** — it's a
   build-time public flag, so a running deployment won't pick it up until rebuilt.

### The experimental client opt-in

Passkeys are experimental in `@supabase/supabase-js`, so the **browser client must
opt in**. `src/lib/supabase/client.ts` constructs it with
`{ auth: { experimental: { passkey: true } } }`; without this,
`signInWithPasskey()` / `registerPasskey()` are unavailable. `passkeysEnabled`
(on `useAuth()`) is `true` only when `mode === "supabase"` **and**
`NEXT_PUBLIC_AUTH_PASSKEY === "true"`.

## The `/auth/callback` redirect

`src/app/auth/callback/route.ts` is the return target for magic link, OAuth, and
SSO. It exchanges the `?code` for a session (`exchangeCodeForSession`, cookies
set via the server client) then redirects to `?next` (default `/`). The
AuthProvider always sets `redirectTo`/`emailRedirectTo` to
`${origin}/auth/callback`.

## Files

| File | Role |
|---|---|
| `src/lib/auth/types.ts` | The fixed `AuthContextValue` contract |
| `src/lib/auth/AuthProvider.tsx` | Provider + `useAuth()` (supabase + demo) |
| `src/lib/supabase/client.ts` | Browser client (`createBrowserClient`), `supabaseConfigured()` |
| `src/lib/supabase/server.ts` | Server client (cookies via `next/headers`) |
| `middleware.ts` | Session refresh + `/login` enforcement (configured only) |
| `src/app/auth/callback/route.ts` | Code → session exchange |
| `supabase/migrations/0004_auth.sql` | `profiles` + `current_app_role()` |
| `scripts/create-user.mjs` | Admin create-user (service role) |
