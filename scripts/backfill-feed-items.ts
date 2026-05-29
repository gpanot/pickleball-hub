/**
 * One-time backfill: writes feed_items rows for the last 48 hours of activity.
 * Safe to re-run — all upserts are idempotent.
 * Delete this file after running.
 *
 * Usage:
 *   cd pickleball-hub
 *   npx tsx scripts/backfill-feed-items.ts
 */
import { prisma } from '../src/lib/db'

const now = new Date()
const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000)
const todayStr = now.toISOString().split('T')[0]!
const cutoffStr = cutoff.toISOString().split('T')[0]!

async function backfill() {
  console.log(`Backfilling feed items from ${cutoffStr} to ${todayStr}`)

  const profiles = await prisma.playerProfile.findMany({
    where: { following: { some: {} } },
    select: { id: true },
  })

  console.log(`Processing ${profiles.length} profiles...`)

  let totalItems = 0

  for (const profile of profiles) {
    try {
      const follows = await prisma.follow.findMany({
        where: { followerId: profile.id },
        select: { followeeId: true },
      })
      const followeeIds = follows.map((f) => f.followeeId)
      if (followeeIds.length === 0) continue

      const rosters = await prisma.sessionRoster.findMany({
        where: {
          userId: { in: followeeIds },
          session: { scrapedDate: { gte: cutoffStr } },
        },
        include: {
          player: {
            select: {
              userId: true,
              displayName: true,
              imageUrl: true,
              duprDoubles: true,
            },
          },
          session: {
            select: {
              id: true,
              name: true,
              startTime: true,
              scrapedDate: true,
              eventUrl: true,
              maxPlayers: true,
              club: { select: { name: true } },
              snapshots: { orderBy: { scrapedAt: 'desc' }, take: 1 },
            },
          },
        },
        take: 100,
      })

      const items = rosters.map((r) => {
        const scrapedAt = r.session.snapshots?.[0]?.scrapedAt
        const sessionDate = r.session.scrapedDate
        const sessionStart = new Date(`${sessionDate}T${r.session.startTime}+07:00`)
        const isToday = sessionDate === todayStr
        const isFuture = sessionStart > now

        const type = isFuture ? 'joining' : isToday ? 'played_today' : 'played'
        const id = `${type}_${r.userId}_${r.session.id}`
        const timestamp =
          scrapedAt ?? new Date(`${sessionDate}T${r.session.startTime}+07:00`)

        const payload = {
          id,
          type,
          player: {
            userId: String(r.player.userId),
            displayName: r.player.displayName,
            imageUrl: r.player.imageUrl,
            duprDoubles: r.player.duprDoubles ? Number(r.player.duprDoubles) : null,
          },
          sessionName: r.session.name,
          venueName: r.session.club.name,
          sessionTime: `${sessionDate}T${r.session.startTime}:00+07:00`,
          eventUrl: r.session.eventUrl,
          isFollowing: true,
          timestamp: timestamp.toISOString(),
          kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
        }

        return {
          id,
          profileId: profile.id,
          type,
          playerUserId: String(r.player.userId),
          payload,
          timestamp,
        }
      })

      if (items.length > 0) {
        await Promise.all(
          items.map((item) =>
            prisma.feedItem.upsert({
              where: { id: item.id },
              create: item,
              update: {
                payload: item.payload,
                timestamp: item.timestamp,
              },
            })
          )
        )
        totalItems += items.length
        console.log(`✓ ${profile.id}: ${items.length} items`)
      }
    } catch (e) {
      console.log(`✗ ${profile.id}:`, e)
    }
  }

  console.log(`Backfill complete. Wrote ${totalItems} items across ${profiles.length} profiles.`)
  await prisma.$disconnect()
}

backfill()
