/**
 * Creates or updates DEMO-ORG-001 and DEMO-VEN-001 in the database.
 * Run: npx tsx scripts/upsert-demo-access-codes.ts
 * (Requires DATABASE_URL in .env or environment)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const firstClub = await prisma.club.findFirst({ orderBy: { numMembers: "desc" } });
  const firstVenue = await prisma.venue.findFirst();

  if (!firstClub) {
    console.error("No clubs in database. Ingest data first.");
    process.exit(1);
  }
  if (!firstVenue) {
    console.error("No venues in database. Ingest data first.");
    process.exit(1);
  }

  await prisma.accessCode.upsert({
    where: { code: "DEMO-ORG-001" },
    create: {
      code: "DEMO-ORG-001",
      entityType: "club",
      clubId: firstClub.id,
      label: `Demo: ${firstClub.name}`,
    },
    update: { clubId: firstClub.id, label: `Demo: ${firstClub.name}` },
  });
  console.log(`DEMO-ORG-001 -> club #${firstClub.id} ${firstClub.name}`);

  await prisma.accessCode.upsert({
    where: { code: "DEMO-VEN-001" },
    create: {
      code: "DEMO-VEN-001",
      entityType: "venue",
      venueId: firstVenue.id,
      label: `Demo: ${firstVenue.name}`,
    },
    update: { venueId: firstVenue.id, label: `Demo: ${firstVenue.name}` },
  });
  console.log(`DEMO-VEN-001 -> venue #${firstVenue.id} ${firstVenue.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
