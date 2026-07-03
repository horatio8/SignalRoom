import { redirect } from "next/navigation";

/** /[campaign] → the campaign's overview (S1). */
export default async function CampaignIndex({
  params,
}: {
  params: Promise<{ campaign: string }>;
}) {
  const { campaign } = await params;
  redirect(`/${campaign}/overview`);
}
