"use client";

import React from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { useLiveCampaigns } from "@/lib/data/liveCampaigns";

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ campaign: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const campaign = params.campaign;

  // A slug is admitted only when it's a confirmed live campaign the user can
  // see (RLS-scoped). The lookup is async, so consult `loading` before treating
  // an absent slug as truly missing.
  const { campaigns, loading } = useLiveCampaigns();
  const exists = campaigns.some((c) => c.slug === campaign);

  React.useEffect(() => {
    if (loading) return;
    // Confirmed absent: send the user to their first available campaign, or to
    // onboarding when they have none.
    if (!exists) {
      const first = campaigns[0];
      router.replace(first ? `/${first.slug}/overview` : "/onboarding");
    }
  }, [loading, exists, campaigns, router]);

  // Render nothing while the lookup is in flight (no flash), or once the slug is
  // confirmed absent (the effect above is redirecting).
  if (loading || !exists) return null;

  const screen = pathname.split("/").filter(Boolean)[1] ?? "overview";

  return (
    <AppShell screen={screen} campaign={campaign}>
      {children}
    </AppShell>
  );
}
