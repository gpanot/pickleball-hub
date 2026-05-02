import type { Metadata } from "next";
import { SessionDetailNotFound } from "@/components/SessionDetailNotFound";
import { SessionPublicDetail } from "@/components/SessionPublicDetail";
import { getSessionByReferenceCode } from "@/lib/queries";
import { HUB_SITE_ORIGIN } from "@/lib/site";
import { formatCalendarDayLabel, formatVND } from "@/lib/utils";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ referenceCode: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { referenceCode } = await params;
  const data = await getSessionByReferenceCode(decodeURIComponent(referenceCode));
  if (!data) {
    return { title: "Session not found" };
  }
  const { session } = data;
  const day = formatCalendarDayLabel(session.scrapedDate, "en-US");
  const sched = `${day} · ${session.startTime}–${session.endTime}`;
  const price = formatVND(session.feeAmount);
  const url = `${HUB_SITE_ORIGIN}/sessions/${encodeURIComponent(session.referenceCode)}`;
  return {
    title: session.name,
    description: `${session.club.name} · ${price} · pickleball-hub-gules.vercel.app`,
    openGraph: {
      title: session.name,
      description: `${sched} · ${price} · Book on Reclub`,
      url,
      type: "website",
    },
  };
}

export default async function SessionByReferencePage({ params }: PageProps) {
  const { referenceCode } = await params;
  const data = await getSessionByReferenceCode(decodeURIComponent(referenceCode));
  if (!data) {
    return <SessionDetailNotFound />;
  }
  return (
    <SessionPublicDetail session={data.session} hcmMedianCostPerHour={data.hcmMedianCostPerHour} />
  );
}
