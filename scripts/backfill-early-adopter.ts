/**
 * One-time backfill: writes early_adopter feed items for the first 1,000 players
 * (ranked by user_id ascending) who haven't had the milestone set yet.
 *
 * Safe to re-run — all upserts and flag writes are idempotent.
 * Delete this file after running.
 *
 * Usage:
 *   cd pickleball-hub
 *   npx tsx scripts/backfill-early-adopter.ts
 */
import { prisma } from '../src/lib/db'
import { EARLY_ADOPTER_KEY, setMilestoneFlag } from '../src/lib/feed-milestones'

const TIMESTAMP = new Date().toISOString()

async function backfill() {
  // Fetch the first 1,000 players ordered by userId ascending
  const top1000 = await prisma.player.findMany({
    orderBy: { userId: 'asc' },
    take: 1000,
    select: {
      userId: true,
      displayName: true,
      imageUrl: true,
      duprDoubles: true,
    },
  })

  console.log(`Found ${top1000.length} early adopter candidates`)

  let flagsSet = 0
  let itemsCreated = 0
  let skipped = 0

  for (const player of top1000) {
    const profile = await prisma.playerProfile.findUnique({
      where: { reclubUserId: player.userId },
      select: { id: true, preferences: true },
    })
    if (!profile) {
      skipped++
      continue
    }

    const prefs = (profile.preferences ?? {}) as Record<string, unknown>
    if (prefs[EARLY_ADOPTER_KEY]) {
      skipped++
      continue
    }

    // Set the flag
    await setMilestoneFlag(player.userId, EARLY_ADOPTER_KEY)
    flagsSet++

    const imageUrl = player.imageUrl ?? `https://api.reclub.io/avatars/${player.userId}`

    // Fan out to all followers
    const followers = await prisma.follow.findMany({
      where: { followeeId: player.userId },
      select: { followerId: true },
    })

    for (const { followerId } of followers) {
      const itemId = `early_adopter_${player.userId}_${followerId}`
      await prisma.feedItem.upsert({
        where: { id: itemId },
        create: {
          id: itemId,
          profileId: followerId,
          type: 'early_adopter',
          playerUserId: player.userId.toString(),
          payload: {
            id: itemId,
            type: 'early_adopter',
            player: {
              userId: player.userId.toString(),
              displayName: player.displayName,
              imageUrl,
              duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
            },
            timestamp: TIMESTAMP,
            isFollowing: true,
            kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
          },
          timestamp: new Date(TIMESTAMP),
        },
        update: {},
      })
      itemsCreated++
    }

    if (flagsSet % 50 === 0) {
      console.log(`  Progress: ${flagsSet} flags set, ${itemsCreated} feed items created`)
    }
  }

  console.log(`\nDone!`)
  console.log(`  Flags set: ${flagsSet}`)
  console.log(`  Feed items created: ${itemsCreated}`)
  console.log(`  Skipped (no profile or already set): ${skipped}`)
}

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
