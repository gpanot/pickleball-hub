import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import {
  reclubAvatarUrl,
  vnCalendarDateString,
  vnCurrentTimeString,
  haversineKm,
  isFillingFast,
} from '@/lib/utils'
import { CACHE_CONTROL_PRIVATE } from '@/lib/http-cache-headers'
import { calculateMatchScore } from '@/lib/match-score'

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
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  const userLat = Number.isFinite(lat) ? lat : null
  const userLng = Number.isFinite(lng) ? lng : null

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
  const followeeIdSet = new Set(followeeIds.map((id) => id.toString()))

  console.log(`[friends-going] filter=${filter} today=${today} minTime=${minTime ?? 'none'} followeeCount=${followeeIds.length}`)

  if (followeeIds.length === 0) {
    console.log(`[friends-going] no followees → returning empty`)
    return NextResponse.json(
      { friendsGoing: [] },
      { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
    )
  }

  let userDupr: number | null = null
  if (user.reclubUserId) {
    const player = await prisma.player.findUnique({
      where: { userId: user.reclubUserId },
      select: { duprDoubles: true },
    })
    userDupr = player?.duprDoubles != null ? Number(player.duprDoubles) : null
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
          venue: { select: { name: true, latitude: true, longitude: true } },
          duprStat: true,
          snapshots: { orderBy: { scrapedAt: 'desc' }, take: 2 },
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

  const friendsGoing = await Promise.all(
    Array.from(sessionMap.values())
      .sort((a, b) => b.friends.length - a.friends.length)
      .map(async ({ session, friends }) => {
        const snap0 = session.snapshots[0]
        const snap1 = session.snapshots[1]
        const joined = snap0?.joined ?? 0
        const joinedPrev = snap1?.joined ?? 0
        const joinedRecently = Math.max(0, joined - joinedPrev)
        const spotsLeft = Math.max(0, session.maxPlayers - joined)
        const fillRate = session.maxPlayers > 0 ? joined / session.maxPlayers : 0
        const fillingFast = isFillingFast(fillRate, joinedRecently)
        const friendCount = friends.length

        let distanceKm: number | null = null
        if (
          userLat !== null &&
          userLng !== null &&
          session.venue?.latitude != null &&
          session.venue?.longitude != null
        ) {
          distanceKm =
            Math.round(
              haversineKm(
                userLat,
                userLng,
                session.venue.latitude,
                session.venue.longitude,
              ) * 10,
            ) / 10
        }

        const matchScore = calculateMatchScore({
          userDupr,
          sessionAvgDupr: session.duprStat?.avgDuprDoubles
            ? Number(session.duprStat.avgDuprDoubles)
            : null,
          distanceKm,
          fillRate,
          joinedRecently,
          fillingFast,
          returningPlayerPct: session.duprStat?.returningPlayerPct
            ? Number(session.duprStat.returningPlayerPct)
            : null,
          friendCount,
        })

        const [topRoster, duprCount] = await Promise.all([
          prisma.sessionRoster.findMany({
            where: {
              sessionId: session.id,
              player: { duprDoubles: { not: null } },
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
            },
            orderBy: { player: { duprDoubles: 'desc' } },
            take: 8,
          }),
          prisma.sessionRoster.count({
            where: {
              sessionId: session.id,
              player: { duprDoubles: { not: null } },
            },
          }),
        ])

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
          matchScore,
          fillingFast,
          distanceKm,
          friendCount,
          friends: friends.slice(0, 3),
          totalRoster: session._count.rosters,
          duprCount,
          topDupr: topRoster.map((r) => ({
            userId: String(r.player.userId),
            displayName: r.player.displayName,
            imageUrl: r.player.imageUrl ?? null,
            duprDoubles: r.player.duprDoubles
              ? Number(r.player.duprDoubles)
              : null,
            isFollowing: followeeIdSet.has(String(r.player.userId)),
          })),
        }
      }),
  )

  console.log(`[friends-going] result: ${friendsGoing.length} sessions`)
  friendsGoing.forEach((s) => {
    console.log(`  → "${s.name}" startTime=${s.startTime} scrapedDate=${s.scrapedDate} friendCount=${s.friendCount} friends=${s.friends.map((f) => f.displayName).join(', ')}`)
  })

  return NextResponse.json(
    { friendsGoing },
    { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
  )
}
