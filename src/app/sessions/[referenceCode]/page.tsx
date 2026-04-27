import type { Metadata } from "next";
import { SessionDetailNotFound } from "@/components/SessionDetailNotFound";
import { SessionPublicDetail } from "@/components/SessionPublicDetail";
import { prisma } from "@/lib/db";
import { getSessionByReferenceCode } from "@/lib/queries";
import { HUB_SITE_ORIGIN } from "@/lib/site";
import { formatCalendarDayLabel, formatVND, vnCalendarDateString } from "@/lib/utils";

export const revalidate = false;

export async function generateStaticParams() {
  const todayStr = vnCalendarDateString(0);
  // Pre-render at most this many (each path runs generateMetadata + page; low DB `max_connections` can fail the build if too high).
  const maxPreRendered = Number.parseInt(process.env.STATIC_SESSION_DETAIL_MAX ?? "40", 10) || 40;
  const rows = await prisma.session.findMany({
    where: { scrapedDate: todayStr },
    select: { referenceCode: true },
    orderBy: { startTime: "asc" },
    take: 500,
  });
  const seen = new Set<string>();
  const out: { referenceCode: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.referenceCode)) continue;
    seen.add(r.referenceCode);
    out.push(r);
    if (out.length >= maxPreRendered) break;
  }
  return out.map((s) => ({ referenceCode: s.referenceCode }));
}

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
