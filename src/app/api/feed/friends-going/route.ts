import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { reclubAvatarUrl, vnCalendarDateString, vnCurrentTimeString } from '@/lib/utils'
import { CACHE_CONTROL_PRIVATE } from '@/lib/http-cache-headers'

/**
 * GET /api/feed/friends-going?filter=today|tomorrow|all
 *
 * Returns two lists:
 * - friendsGoing: sessions where ≥1 followed player appears on the roster,
 *   sorted by friend count desc, with up to 3 friend avatars each.
 * - savedSessionIds: echoes back the caller's saved session IDs so the
 *   client can cross-reference them locally (ids passed as ?saved=1,2,3).
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'today'

  // scrapedDate strings in Vietnam time
  const today = vnCalendarDateString(0)
  const tomorrow = vnCalendarDateString(1)

  // For today only, hide sessions that have already started — same logic as swipe-deck.
  const minTime = filter === 'today' ? vnCurrentTimeString() : undefined

  const scrapedDateFilter =
    filter === 'today'
      ? { scrapedDate: today, ...(minTime ? { startTime: { gte: minTime } } : {}) }
      : filter === 'tomorrow'
        ? { scrapedDate: tomorrow }
        : { scrapedDate: { gte: today } }

  // Who does this user follow?
  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  })
  const followeeIds = follows.map((f) => f.followeeId)

  console.log(`[friends-going] filter=${filter} today=${today} minTime=${minTime ?? 'none'} followeeCount=${followeeIds.length}`)

  if (followeeIds.length === 0) {
    console.log(`[friends-going] no followees → returning empty`)
    return NextResponse.json(
      { friendsGoing: [] },
      { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
    )
  }

  // Roster entries for sessions on the requested date(s) where a followed player appears.
  // Note: Club has no lat/lng — only Venue does. We join venue for location display.
  const rosterRows = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      isConfirmed: true,
      session: { ...scrapedDateFilter, status: 'active' },
    },
    select: {
      userId: true,
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          maxPlayers: true,
          eventUrl: true,
          scrapedDate: true,
          club: { select: { name: true } },
          venue: { select: { name: true } },
          snapshots: { orderBy: { scrapedAt: 'desc' }, take: 1 },
          _count: { select: { rosters: true } },
        },
      },
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
    },
    orderBy: { session: { startTime: 'asc' } },
  })

  console.log(`[friends-going] rosterRows=${rosterRows.length} scrapedDateFilter=${JSON.stringify(scrapedDateFilter)}`)

  // Group by session
  const sessionMap = new Map<
    number,
    {
      session: (typeof rosterRows)[0]['session']
      friends: Array<{
        userId: string
        displayName: string
        imageUrl: string | null
        duprDoubles: number | null
      }>
      friendUserIds: Set<string>
    }
  >()

  for (const row of rosterRows) {
    const sid = row.session.id
    const uid = String(row.player.userId)
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, { session: row.session, friends: [], friendUserIds: new Set() })
    }
    const entry = sessionMap.get(sid)!
    // Deduplicate: same player may appear multiple times if scraped across days
    if (!entry.friendUserIds.has(uid)) {
      entry.friendUserIds.add(uid)
      entry.friends.push({
        userId: uid,
        displayName: row.player.displayName ?? 'Player',
        imageUrl: row.player.imageUrl ?? reclubAvatarUrl(row.player.userId),
        duprDoubles: row.player.duprDoubles ? Number(row.player.duprDoubles) : null,
      })
    }
  }

  const friendsGoing = Array.from(sessionMap.values())
    .sort((a, b) => b.friends.length - a.friends.length)
    .map(({ session, friends }) => {
      const snap = session.snapshots[0]
      const joined = snap?.joined ?? 0
      const spotsLeft = Math.max(0, session.maxPlayers - joined)
      return {
        sessionId: session.id,
        name: session.name,
        clubName: session.club.name,
        venueName: session.venue?.name ?? session.club.name,
        startTime: session.startTime,
        scrapedDate: session.scrapedDate,
        spotsLeft,
        totalSpots: session.maxPlayers,
        eventUrl: session.eventUrl,
        matchScore: 0,
        friendCount: friends.length,
        friends: friends.slice(0, 3),
        totalRoster: session._count.rosters,
      }
    })

  console.log(`[friends-going] result: ${friendsGoing.length} sessions`)
  friendsGoing.forEach((s) => {
    console.log(`  → "${s.name}" startTime=${s.startTime} scrapedDate=${s.scrapedDate} friendCount=${s.friendCount} friends=${s.friends.map((f) => f.displayName).join(', ')}`)
  })

  return NextResponse.json(
    { friendsGoing },
    { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
  )
}
