import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
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

// Cached per-session DUPR enrichment — top roster rows + counts for a given date.
// Keyed on date strings; session IDs are derived in-memory from the roster cache above.
const getCachedSessionDuprData = unstable_cache(
  async (sessionIds: number[]) => {
    const [topRows, counts] = await Promise.all([
      prisma.sessionRoster.findMany({
        where: {
          sessionId: { in: sessionIds },
          player: { duprDoubles: { not: null } },
        },
        select: {
          sessionId: true,
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
      }),
      prisma.sessionRoster.groupBy({
        by: ['sessionId'],
        where: {
          sessionId: { in: sessionIds },
          player: { duprDoubles: { not: null } },
        },
        _count: { sessionId: true },
      }),
    ])
    // Serialize BigInt/Decimal before caching
    return [
      topRows.map((r) => ({
        ...r,
        player: {
          ...r.player,
          userId: r.player.userId.toString(),
          duprDoubles: r.player.duprDoubles != null ? Number(r.player.duprDoubles) : null,
        },
      })),
      counts,
    ] as const
  },
  ['friend-rosters-dupr'],
  { revalidate: 600 },
)

/**
 * GET /api/feed/friends-going?filter=today|tomorrow|both|all
 *
 * filter=both  →  returns { today: FriendGoingItem[], tomorrow: FriendGoingItem[] }
 *                 in a single request: auth + follow graph + roster queries run once.
 * filter=today|tomorrow|all  →  returns { friendsGoing: FriendGoingItem[] } (legacy shape)
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

  const today = vnCalendarDateString(0)
  const tomorrow = vnCalendarDateString(1)
  const minTime = vnCurrentTimeString()

  // ── Fetch follow graph, blocks, and user DUPR in parallel ───────────────────
  const [follows, userProfile, blocking, blockedBy] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: user.profileId },
      select: { followeeId: true },
    }),
    user.reclubUserId
      ? prisma.player.findUnique({
          where: { userId: user.reclubUserId },
          select: { duprDoubles: true },
        })
      : Promise.resolve(null),
    prisma.block.findMany({
      where: { blockerId: user.profileId },
      select: { blocked: { select: { reclubUserId: true } } },
    }),
    user.reclubUserId
      ? prisma.block.findMany({
          where: { blockedId: user.profileId },
          select: { blocker: { select: { reclubUserId: true } } },
        })
      : Promise.resolve([]),
  ])

  // Resolve blocked profile IDs → reclubUserIds (BigInt) to filter followeeIds
  const blockedReclubIds = new Set<string>([
    ...blocking.flatMap((b) => (b.blocked.reclubUserId ? [b.blocked.reclubUserId.toString()] : [])),
    ...(blockedBy as Array<{ blocker: { reclubUserId: bigint | null } }>).flatMap((b) =>
      b.blocker.reclubUserId ? [b.blocker.reclubUserId.toString()] : [],
    ),
  ])

  const allFolloweeIds = follows.map((f) => f.followeeId)
  const followeeIds = allFolloweeIds.filter((id) => !blockedReclubIds.has(id.toString()))
  const followeeIdSet = new Set(followeeIds.map((id) => id.toString()))
  const userDupr = userProfile?.duprDoubles != null ? Number(userProfile.duprDoubles) : null

  console.log(`[friends-going] filter=${filter} followeeCount=${followeeIds.length}`)

  if (followeeIds.length === 0) {
    console.log('[friends-going] no followees → returning empty')
    if (filter === 'both') {
      return NextResponse.json(
        { today: [], tomorrow: [] },
        { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
      )
    }
    return NextResponse.json(
      { friendsGoing: [] },
      { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
    )
  }

  // ── Main roster query — scoped to this user's followees only ───────────────
  // Not cached: the payload per-user is small (only this user's ~15 followees),
  // whereas caching the entire city's roster exceeded the 2MB unstable_cache limit.
  const scrapedDateFilter =
    filter === 'both'
      ? { scrapedDate: { in: [today, tomorrow] as string[] } }
      : filter === 'today'
        ? { scrapedDate: today, startTime: { gte: minTime } }
        : filter === 'tomorrow'
          ? { scrapedDate: tomorrow }
          : { scrapedDate: { gte: today } }

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
          snapshots: {
            orderBy: { scrapedAt: 'desc' },
            take: 2,
            select: { joined: true },
          },
          duprStat: {
            select: {
              avgDuprDoubles: true,
              returningPlayerPct: true,
              duprParticipationPct: true,
            },
          },
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

  console.log(`[friends-going] rosterRows=${rosterRows.length}`)

  // Group by session, collecting friend entries
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

  if (sessionMap.size === 0) {
    if (filter === 'both') {
      return NextResponse.json(
        { today: [], tomorrow: [] },
        { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
      )
    }
    return NextResponse.json(
      { friendsGoing: [] },
      { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
    )
  }

  // ── Batch top-DUPR + count across ALL sessions — cached per date ────────────
  const allSessionIds = Array.from(sessionMap.keys())

  const [allTopRosterRows, allDuprCounts] = await getCachedSessionDuprData(allSessionIds)

  // Build per-session lookup maps from the batched results
  const topRosterBySession = new Map<number, typeof allTopRosterRows>()
  for (const row of allTopRosterRows) {
    const sid = row.sessionId
    if (!topRosterBySession.has(sid)) topRosterBySession.set(sid, [])
    topRosterBySession.get(sid)!.push(row)
  }

  const duprCountBySession = new Map<number, number>()
  for (const g of allDuprCounts) {
    duprCountBySession.set(g.sessionId, g._count.sessionId)
  }

  // ── Build result items (pure in-memory, no more per-session queries) ─────────
  function buildItem({
    session,
    friends,
  }: {
    session: (typeof rosterRows)[0]['session']
    friends: Array<{ userId: string; displayName: string; imageUrl: string | null; duprDoubles: number | null }>
  }) {
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
          haversineKm(userLat, userLng, session.venue.latitude, session.venue.longitude) * 10,
        ) / 10
    }

    const matchScore = calculateMatchScore({
      userDupr,
      sessionAvgDupr: session.duprStat?.avgDuprDoubles
        ? Number(session.duprStat.avgDuprDoubles)
        : null,
      fillRate: Math.min(1, joined / Math.max(session.maxPlayers, 1)),
      returningPlayerPct: session.duprStat?.returningPlayerPct
        ? Number(session.duprStat.returningPlayerPct)
        : null,
    })

    const topRosterRows = (topRosterBySession.get(session.id) ?? []).slice(0, 8)
    const duprCount = duprCountBySession.get(session.id) ?? 0

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
      topDupr: topRosterRows.map((r) => ({
        userId: String(r.player.userId),
        displayName: r.player.displayName,
        imageUrl: r.player.imageUrl ?? null,
        duprDoubles: r.player.duprDoubles ? Number(r.player.duprDoubles) : null,
        isFollowing: followeeIdSet.has(String(r.player.userId)),
      })),
    }
  }

  // For filter=both, split results by scrapedDate.
  // Today rows: also filter out sessions that have already started (minTime).
  if (filter === 'both') {
    const todayItems: ReturnType<typeof buildItem>[] = []
    const tomorrowItems: ReturnType<typeof buildItem>[] = []

    for (const entry of sessionMap.values()) {
      if (entry.session.scrapedDate === today) {
        // Drop sessions that have already started (same guard as filter=today)
        if (entry.session.startTime < minTime) continue
        todayItems.push(buildItem(entry))
      } else {
        tomorrowItems.push(buildItem(entry))
      }
    }

    todayItems.sort((a, b) => b.friendCount - a.friendCount)
    tomorrowItems.sort((a, b) => b.friendCount - a.friendCount)

    console.log(`[friends-going] both: today=${todayItems.length} tomorrow=${tomorrowItems.length}`)
    return NextResponse.json(
      { today: todayItems, tomorrow: tomorrowItems },
      { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
    )
  }

  // Legacy single-filter response
  const items = Array.from(sessionMap.values())
    .sort((a, b) => b.friends.length - a.friends.length)
    .map(buildItem)

  console.log(`[friends-going] result: ${items.length} sessions`)
  return NextResponse.json(
    { friendsGoing: items },
    { headers: { 'Cache-Control': CACHE_CONTROL_PRIVATE } },
  )
}
