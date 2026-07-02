"use client";

import React from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { isCampaignId } from "@/lib/data";

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ campaign: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const campaign = params.campaign;

  React.useEffect(() => {
    if (!isCampaignId(campaign)) router.replace("/voss/overview");
  }, [campaign, router]);

  if (!isCampaignId(campaign)) return null;

  const screen = pathname.split("/").filter(Boolean)[1] ?? "overview";

  return (
    <AppShell screen={screen} campaign={campaign}>
      {children}
    </AppShell>
  );
}
