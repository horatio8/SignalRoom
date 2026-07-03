/**
 * Auth contract (spec §8). This is the FIXED interface the login UI codes
 * against — names and signatures here are load-bearing across the app/login
 * page and AppShell; do not rename without updating both agents' work.
 *
 * Two modes:
 *  - "supabase": real Supabase Auth (email+password primary, magic link, OAuth,
 *    SAML SSO), enforced by middleware.ts when the public env is configured.
 *  - "demo": no network — a local session in localStorage so the public Vercel
 *    demo stays open and the login page still works. See docs/AUTH.md.
 */

export type AuthMode = "supabase" | "demo";

/** App-facing role. DB `campaign_members.role` 'client_viewer' maps to 'client'. */
export type AuthRole = "owner" | "operator" | "client";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: AuthRole;
}

/** Which SSO buttons the login page should render (public env feature flags). */
export interface SsoEnabled {
  google: boolean;
  github: boolean;
  azure: boolean;
  saml: boolean;
}

export interface AuthContextValue {
  mode: AuthMode;
  /** Initial session resolved (avoid flashing the login page before we know). */
  ready: boolean;
  user: AuthUser | null;
  signInWithPassword(
    email: string,
    password: string
  ): Promise<{ error: string | null }>;
  signUp(
    email: string,
    password: string,
    name?: string
  ): Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithMagicLink(email: string): Promise<{ error: string | null }>;
  signInWithOAuth(
    provider: "google" | "github" | "azure"
  ): Promise<{ error: string | null }>;
  /** SAML/OIDC by email domain (Supabase Auth signInWithSSO). */
  signInWithSSO(domain: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  /** Demo mode only: set a demo user with the given role instantly. */
  demoSignIn(role?: AuthRole): void;
  ssoEnabled: SsoEnabled;
  /** Populated in demo mode so the login page can display the demo credential. */
  demoCredential: { email: string; password: string } | null;
}
