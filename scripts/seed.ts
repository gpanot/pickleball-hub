/**
 * Seed script: loads hcm_pickleball_today.csv into the database
 * and creates demo access codes.
 *
 * Usage: npx tsx scripts/seed.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function parseFee(feeStr: string): number {
  if (!feeStr || feeStr.toLowerCase() === "free") return 0;
  return parseInt(feeStr.replace(/[^\d]/g, ""), 10) || 0;
}

function parseSkillLevel(name: string): { min: number | null; max: number | null } {
  const range = name.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\+?/);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  const single = name.match(/(\d+\.?\d*)\+/);
  if (single) {
    const v = parseFloat(single[1]);
    if (v >= 1.0 && v <= 6.0) return { min: v, max: null };
  }
  if (/newbie/i.test(name)) return { min: 1.0, max: 2.5 };
  if (/all\s*level/i.test(name)) return { min: 1.0, max: null };
  return { min: null, max: null };
}

function parsePerks(name: string): string[] {
  const perks: string[] = [];
  if (/free\s*(chuối|banana)|tặng.*chuối/i.test(name)) perks.push("banana");
  if (/free\s*(trứng|egg)|tặng.*trứng/i.test(name)) perks.push("egg");
  if (/free\s*(nước|drink|water)|tặng.*nước/i.test(name)) perks.push("drink");
  if (/free\s*(cafe|coffee|cà phê)/i.test(name)) perks.push("coffee");
  if (/free\s*(trái cây|fruit)/i.test(name)) perks.push("fruit");
  if (/free\s*(sữa|milk)/i.test(name)) perks.push("milk");
  if (/free\s*(bánh)/i.test(name)) perks.push("snack");
  if (/drill|clinic/i.test(name)) perks.push("coaching");
  if (/round\s*robin|dupr/i.test(name)) perks.push("tournament");
  return [...new Set(perks)];
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

async function main() {
  const csvPath = path.resolve(__dirname, "../../hcm_pickleball_today.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, "utf-8"));
  console.log(`Loaded ${rows.length} sessions from CSV`);

  const today = new Date().toISOString().split("T")[0];

  // Upsert clubs
  const clubMap = new Map<string, number>();
  const reclubIdMap = new Map<string, number>();
  for (const row of rows) {
    if (!row.clubSlug || clubMap.has(row.clubSlug)) continue;
    const reclubId = Math.abs(hashCode(row.clubSlug));
    const club = await prisma.club.upsert({
      where: { slug: row.clubSlug },
      create: {
        reclubId,
        name: row.clubName,
        slug: row.clubSlug,
        sportId: 36,
        communityId: 1,
      },
      update: { name: row.clubName },
    });
    clubMap.set(row.clubSlug, club.id);
    reclubIdMap.set(row.clubSlug, reclubId);
  }
  console.log(`Upserted ${clubMap.size} clubs`);

  // Fetch member counts from Reclub API
  console.log("Fetching member counts from Reclub API...");
  for (const [slug, clubId] of clubMap.entries()) {
    try {
      const res = await fetch(`https://reclub.vn/api/groups/${slug}?scopes=COUNTS`, {
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const memberCount = data?.memberCount ?? data?.numMembers ?? data?.member_count ?? 0;
        if (memberCount > 0) {
          await prisma.club.update({
            where: { id: clubId },
            data: { numMembers: memberCount },
          });
        }
      }
    } catch {
      // Skip if API call fails for this club
    }
  }
  console.log("Fetched member counts");

  // Upsert venues
  const venueMap = new Map<string, number>();
  for (const row of rows) {
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    if (!lat || !lng) continue;
    const vkey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
    if (venueMap.has(vkey)) continue;

    const existing = await prisma.venue.findFirst({
      where: {
        latitude: { gte: lat - 0.0005, lte: lat + 0.0005 },
        longitude: { gte: lng - 0.0005, lte: lng + 0.0005 },
      },
    });

    if (existing) {
      venueMap.set(vkey, existing.id);
    } else {
      const venue = await prisma.venue.create({
        data: {
          name: row.locationName,
          address: row.locationAddress,
          latitude: lat,
          longitude: lng,
        },
      });
      venueMap.set(vkey, venue.id);
    }
  }
  console.log(`Upserted ${venueMap.size} venues`);

  // Upsert sessions + snapshots
  let sessionCount = 0;
  for (const row of rows) {
    const clubId = clubMap.get(row.clubSlug);
    if (!clubId) continue;

    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    const vkey = lat && lng ? `${lat.toFixed(4)}_${lng.toFixed(4)}` : null;
    const venueId = vkey ? venueMap.get(vkey) ?? null : null;

    const feeAmount = parseFee(row.fee);
    const durationMin = parseInt(row.duration_min, 10) || 0;
    const costPerHour = durationMin > 0 && feeAmount > 0
      ? Math.round(feeAmount / (durationMin / 60))
      : 0;
    const { min: skillMin, max: skillMax } = parseSkillLevel(row.name);
    const perks = parsePerks(row.name);
    const joined = parseInt(row.joined, 10) || 0;
    const waitlisted = parseInt(row.waitlisted, 10) || 0;

    const session = await prisma.session.upsert({
      where: {
        referenceCode_scrapedDate: {
          referenceCode: row.referenceCode,
          scrapedDate: today,
        },
      },
      create: {
        referenceCode: row.referenceCode,
        name: row.name,
        clubId,
        venueId,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMin,
        maxPlayers: parseInt(row.maxPlayers, 10) || 0,
        feeAmount,
        feeCurrency: "VND",
        costPerHour,
        privacy: row.privacy || "public",
        status: row.status || "active",
        skillLevelMin: skillMin,
        skillLevelMax: skillMax,
        perks,
        eventUrl: row.eventUrl,
        scrapedDate: today,
      },
      update: {
        name: row.name,
        maxPlayers: parseInt(row.maxPlayers, 10) || 0,
        feeAmount,
        costPerHour,
        skillLevelMin: skillMin,
        skillLevelMax: skillMax,
        perks,
      },
    });

    await prisma.dailySnapshot.create({
      data: {
        sessionId: session.id,
        joined,
        waitlisted,
      },
    });

    sessionCount++;
  }
  console.log(`Upserted ${sessionCount} sessions with snapshots`);

  // Compute club daily stats
  const clubIds = [...clubMap.values()];
  for (const cid of clubIds) {
    const sessions = await prisma.session.findMany({
      where: { clubId: cid, scrapedDate: today },
      include: { snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 } },
    });

    if (sessions.length === 0) continue;

    const totalCapacity = sessions.reduce((s, x) => s + x.maxPlayers, 0);
    const totalJoined = sessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0), 0);
    const avgFillRate = totalCapacity > 0 ? totalJoined / totalCapacity : 0;
    const avgFee = sessions.reduce((s, x) => s + x.feeAmount, 0) / sessions.length;
    const revenueEstimate = sessions.reduce(
      (s, x) => s + (x.snapshots[0]?.joined ?? 0) * x.feeAmount,
      0
    );

    await prisma.clubDailyStat.upsert({
      where: { clubId_date: { clubId: cid, date: today } },
      create: {
        clubId: cid,
        date: today,
        totalSessions: sessions.length,
        totalCapacity,
        totalJoined,
        avgFillRate: Math.round(avgFillRate * 1000) / 1000,
        avgFee: Math.round(avgFee),
        revenueEstimate,
      },
      update: {
        totalSessions: sessions.length,
        totalCapacity,
        totalJoined,
        avgFillRate: Math.round(avgFillRate * 1000) / 1000,
        avgFee: Math.round(avgFee),
        revenueEstimate,
      },
    });
  }
  console.log("Computed club daily stats");

  // Create demo access codes
  const firstClub = await prisma.club.findFirst({ orderBy: { numMembers: "desc" } });
  const firstVenue = await prisma.venue.findFirst();

  if (firstClub) {
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
    console.log(`Created organizer access code: DEMO-ORG-001 → ${firstClub.name}`);
  }

  if (firstVenue) {
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
    console.log(`Created venue access code: DEMO-VEN-001 → ${firstVenue.name}`);
  }

  console.log("\nSeed complete!");
  await prisma.$disconnect();
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
