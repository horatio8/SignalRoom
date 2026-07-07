"use client";

/**
 * Home — a thin client redirect. Sends the user to their first live campaign's
 * overview, or to onboarding when they have none. No fixture default.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveCampaigns } from "@/lib/data/liveCampaigns";

export default function Home() {
  const router = useRouter();
  const { campaigns, loading } = useLiveCampaigns();

  useEffect(() => {
    if (loading) return;
    const first = campaigns[0];
    router.replace(first ? `/${first.slug}/overview` : "/onboarding");
  }, [loading, campaigns, router]);

  return null;
}
