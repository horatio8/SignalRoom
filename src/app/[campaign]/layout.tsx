"use client";

import React from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { isCampaignId } from "@/lib/data";
import { useLiveCampaign } from "@/lib/data/liveCampaigns";

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ campaign: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const campaign = params.campaign;

  // A slug is allowed through if it's a fixture id OR a live campaign the user
  // can see (RLS-scoped). Fixtures are decided synchronously; live campaigns
  // require the async lookup, so only consult it for non-fixture slugs.
  const fixture = isCampaignId(campaign);
  const live = useLiveCampaign(campaign);
  const allowed = fixture || live.exists;
  // For a non-fixture slug, wait for the lookup to settle before deciding —
  // `pending` true means "render nothing, don't redirect yet" (no flash).
  const pending = !fixture && live.loading;

  React.useEffect(() => {
    if (!allowed && !pending) router.replace("/voss/overview");
  }, [allowed, pending, router]);

  // Render nothing while a non-fixture slug is still being resolved, or once it
  // is confirmed absent (the effect above is redirecting).
  if (!allowed) return null;

  const screen = pathname.split("/").filter(Boolean)[1] ?? "overview";

  return (
    <AppShell screen={screen} campaign={campaign}>
      {children}
    </AppShell>
  );
}
