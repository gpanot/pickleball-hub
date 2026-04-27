import { getClubs, getClubsLastUpdatedAt } from "@/lib/queries";
import { ClubsClient } from "@/components/ClubsClient";

export const revalidate = false;

function toIsoStringOrNull(d: Date | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d as unknown as string).toISOString();
}

export default async function ClubsPage() {
  const [clubs, lastUpdated] = await Promise.all([getClubs(), getClubsLastUpdatedAt()]);

  return <ClubsClient clubs={clubs} lastUpdatedAt={toIsoStringOrNull(lastUpdated)} />;
}
