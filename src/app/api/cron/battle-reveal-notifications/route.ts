import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find battles whose reveal time has passed with a determined winner
  const battles = await prisma.cardBattle.findMany({
    where: {
      revealAt: { lte: now },
      winnerSquadId: { not: null },
    },
    include: {
      initiatingSquad: { select: { id: true, name: true } },
      rivalSquad: { select: { id: true, name: true } },
      venue: { select: { name: true } },
    },
  });

  let processed = 0;

  for (const battle of battles) {
    const notifType = `battle_result_${battle.id}`;

    // Dedup: check if a SquadAlert of this type already exists for this battle
    const existing = await prisma.squadAlert.findFirst({
      where: { squadId: battle.initiatingSquadId, type: notifType },
    });
    if (existing) continue;

    const winnerId = battle.winnerSquadId!;
    const loserSquadId =
      battle.initiatingSquadId === winnerId
        ? battle.rivalSquadId
        : battle.initiatingSquadId;

    const winnerSquadName =
      battle.initiatingSquadId === winnerId
        ? battle.initiatingSquad.name
        : battle.rivalSquad.name;

    const venueName = battle.venue.name;

    // Fetch members of both squads
    const [winnerMembers, loserMembers] = await Promise.all([
      prisma.squadMember.findMany({
        where: { squadId: winnerId, leftAt: null },
        select: { profileId: true },
      }),
      prisma.squadMember.findMany({
        where: { squadId: loserSquadId, leftAt: null },
        select: { profileId: true },
      }),
    ]);

    // Write SquadAlert rows for all members (serves as dedup marker + in-app alert)
    const winAlerts = winnerMembers.map((m) => ({
      squadId: winnerId,
      recipientProfileId: m.profileId,
      type: notifType,
      title: "⚔️ You won the battle!",
      body: `${winnerSquadName} won at ${venueName}!`,
      payload: { battleId: battle.id, result: "won" } as any,
    }));
    const loseAlerts = loserMembers.map((m) => ({
      squadId: loserSquadId,
      recipientProfileId: m.profileId,
      type: notifType,
      title: "⚔️ Battle result is in",
      body: `${winnerSquadName} took the win at ${venueName}. Counter-attack?`,
      payload: { battleId: battle.id, result: "lost" } as any,
    }));

    if (winAlerts.length > 0) {
      await prisma.squadAlert.createMany({ data: winAlerts, skipDuplicates: true });
    }
    if (loseAlerts.length > 0) {
      await prisma.squadAlert.createMany({ data: loseAlerts, skipDuplicates: true });
    }

    // Send PNS to all members
    for (const member of winnerMembers) {
      sendPushNotification(member.profileId, {
        title: "⚔️ You won the battle!",
        body: `${winnerSquadName} won at ${venueName}! Tap to see results.`,
        data: {
          screen: "ConquestBattleResult",
          type: "battle_won",
          battleId: battle.id,
          result: "won",
        },
      }).catch((e) => console.error("[battle-reveal] win push error:", e));
    }

    for (const member of loserMembers) {
      sendPushNotification(member.profileId, {
        title: "⚔️ Battle result is in",
        body: `${winnerSquadName} took the win at ${venueName}. Counter-attack available!`,
        data: {
          screen: "ConquestBattleResult",
          type: "battle_lost",
          battleId: battle.id,
          result: "lost",
        },
      }).catch((e) => console.error("[battle-reveal] loss push error:", e));
    }

    console.log(`[battle-reveal] Sent result PNS for battle ${battle.id} — winner ${winnerId}`);
    processed++;
  }

  return NextResponse.json({ processed, total: battles.length });
}
