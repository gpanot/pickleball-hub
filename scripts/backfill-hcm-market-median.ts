/**
 * One-off: recompute and upsert `hcm_market_median_daily` for every distinct `sessions.scraped_date`.
 *
 * Requires the table to exist: `cd pickleball-hub && npx prisma migrate deploy`
 *
 * Run: `cd pickleball-hub && npx tsx scripts/backfill-hcm-market-median.ts`
 */
import { prisma } from "../src/lib/db";
import { getHcmMedianCostPerHourForDate } from "../src/lib/queries";

async function main() {
  const rows = await prisma.session.findMany({
    select: { scrapedDate: true },
    distinct: ["scrapedDate"],
    orderBy: { scrapedDate: "asc" },
  });
  console.log(`Backfilling ${rows.length} dates…`);
  for (const { scrapedDate } of rows) {
    const median = await getHcmMedianCostPerHourForDate(scrapedDate);
    console.log(scrapedDate, median);
  }
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
