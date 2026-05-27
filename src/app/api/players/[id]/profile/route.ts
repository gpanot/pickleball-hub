import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { reclubAvatarUrl, haversineKm } from '@/lib/utils'

function formatClock(clock: string): string {
  const [hStr, mStr] = clock.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr ?? '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === '00' ? `${h12} ${ampm}` : `${h12}:${m} ${ampm}`
}

function formatTimeSlot(start: string, end: string): string {
  return `${formatClock(start)}–${formatClock(end)}`
}

function truncateName(name: string, max = 32): string {
  return name.length > max ? `${name.slice(0, max)}…` : name
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const targetId = BigInt(id)

  // ?quick=1 returns only fast fields (no sessionRoster scan)
  const quick = req.nextUrl.searchParams.get('quick') === '1'

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  const userLat = Number.isFinite(lat) ? lat : null
  const userLng = Number.isFinite(lng) ? lng : null

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffStr = thirtyDaysAgo.toISOString().slice(0, 10)

  // Always run fast queries in parallel
  const fastQueries = Promise.all([
    prisma.player.findUnique({
      where: { userId: targetId },
      select: {
        userId: true,
        displayName: true,
        imageUrl: true,
        duprDoubles: true,
        _count: { select: { rosters: true } }
      }
    }),
    prisma.follow.findFirst({
      where: { followerId: user.profileId, followeeId: targetId }
    }),
    prisma.playerProfile.findUnique({
      where: { reclubUserId: targetId },
      select: { _count: { select: { following: true } } }
    }),
    prisma.kudos.groupBy({
      by: ['type'],
      where: { toPlayerId: targetId },
      _count: { type: true }
    }).catch(() => [] as Array<{ type: string; _count: { type: number } }>),
    prisma.kudos.findMany({
      where: { fromPlayerId: user.profileId, toPlayerId: targetId },
      select: { type: true }
    }).catch(() => [] as Array<{ type: string }>),
  ])

  // Heavy query — only run when not in quick mode
  const venueQuery = quick
    ? Promise.resolve([] as typeof playRosters)
    : prisma.sessionRoster.findMany({
        where: {
          userId: targetId,
          session: { scrapedDate: { gte: cutoffStr } },
        },
        select: {
          session: {
            select: {
              name: true,
              startTime: true,
              endTime: true,
              eventUrl: true,
              scrapedDate: true,
              club: { select: { id: true, name: true } },
              venue: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
        },
        orderBy: { session: { scrapedDate: 'desc' } },
        take: 200,
      })

  type PlayRoster = {
    session: {
      name: string
      startTime: string
      endTime: string
      eventUrl: string
      scrapedDate: string
      club: { id: number; name: string }
      venue: { id: number; name: string; address: string | null; latitude: number | null; longitude: number | null } | null
    }
  }
  // eslint-disable-next-line prefer-const
  let playRosters: PlayRoster[] = []

  const [[player, isFollowing, playerProfile, kudosCounts, myKudos], rostersResult] =
    await Promise.all([fastQueries, venueQuery])

  if (!quick) {
    playRosters = rostersResult as PlayRoster[]
  }

  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  type SlotAgg = {
    timeLabel: string
    sessionName: string
    count: number
    eventUrl: string
    lastScraped: string
  }
  type VenueAgg = {
    clubName: string
    venueName: string | null
    venueAddress: string | null
    latitude: number | null
    longitude: number | null
    visitCount: number
    slots: Map<string, SlotAgg>
  }

  const venueMap = new Map<string, VenueAgg>()
  for (const r of playRosters) {
    const sess = r.session
    const placeKey = sess.venue
      ? `venue-${sess.venue.id}`
      : `club-${sess.club.id}`
    const slotKey = `${sess.startTime}|${sess.endTime}|${sess.name}`

    if (!venueMap.has(placeKey)) {
      venueMap.set(placeKey, {
        clubName: sess.club.name,
        venueName: sess.venue?.name ?? null,
        venueAddress: sess.venue?.address
          ? truncateName(sess.venue.address, 48)
          : null,
        latitude: sess.venue?.latitude ?? null,
        longitude: sess.venue?.longitude ?? null,
        visitCount: 0,
        slots: new Map(),
      })
    }
    const venue = venueMap.get(placeKey)!
    venue.visitCount++

    const existing = venue.slots.get(slotKey)
    if (existing) {
      existing.count++
      if (sess.scrapedDate > existing.lastScraped) {
        existing.lastScraped = sess.scrapedDate
        existing.eventUrl = sess.eventUrl
      }
    } else {
      venue.slots.set(slotKey, {
        timeLabel: formatTimeSlot(sess.startTime, sess.endTime),
        sessionName: truncateName(sess.name),
        count: 1,
        eventUrl: sess.eventUrl,
        lastScraped: sess.scrapedDate,
      })
    }
  }

  const regularPlay = Array.from(venueMap.values())
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, 6)
    .map((v) => {
      let distanceKm: number | null = null
      if (
        userLat !== null &&
        userLng !== null &&
        v.latitude != null &&
        v.longitude != null
      ) {
        distanceKm =
          Math.round(
            haversineKm(userLat, userLng, v.latitude, v.longitude) * 10
          ) / 10
      }
      const placeLabel = v.venueName ?? v.clubName
      return {
        clubName: truncateName(v.clubName, 36),
        venueName: v.venueName ? truncateName(v.venueName, 40) : null,
        venueAddress: v.venueAddress,
        placeLabel: truncateName(placeLabel, 40),
        latitude: v.latitude,
        longitude: v.longitude,
        distanceKm,
        visitCount: v.visitCount,
        sessions: Array.from(v.slots.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
          .map((slot) => ({
            timeLabel: slot.timeLabel,
            sessionName: slot.sessionName,
            count: slot.count,
            eventUrl: slot.eventUrl,
          })),
      }
    })

  const kudosResult: Record<string, number> = { fistbump: 0, flame: 0, star: 0 }
  for (const k of kudosCounts) {
    if (k.type in kudosResult) {
      kudosResult[k.type] = k._count.type
    }
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const playerSessions = await prisma.sessionRoster.findMany({
    where: {
      userId: targetId,
      session: { scrapedDate: { lt: todayStr } },
    },
    select: { session: { select: { startTime: true, scrapedDate: true } } },
    orderBy: { session: { startTime: 'desc' } },
    take: 200,
  })

  function getWeekKey(date: Date): string {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    )
    return `${d.getFullYear()}-${weekNum}`
  }
  const weeksWithSessions = new Set(
    playerSessions.map((s) =>
      getWeekKey(new Date(`${s.session.scrapedDate}T12:00:00`))
    )
  )

  let streak = 0
  let missedWeeks = 0
  const weeklyPlayed: boolean[] = []

  for (let i = 0; i < 12; i++) {
    const checkDate = new Date(now)
    checkDate.setDate(checkDate.getDate() - i * 7)
    const weekKey = getWeekKey(checkDate)
    const played = weeksWithSessions.has(weekKey)
    if (i < 6) weeklyPlayed.push(played)
    if (played) {
      streak++
      missedWeeks = 0
    } else {
      missedWeeks++
      if (i > 0 && missedWeeks > 1) break
    }
  }

  const streakData = {
    currentStreak: streak,
    weeklyPlayed: weeklyPlayed.reverse(),
  }

  return NextResponse.json({
    userId: player.userId.toString(),
    displayName: player.displayName,
    imageUrl: player.imageUrl ?? reclubAvatarUrl(player.userId),
    duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
    reclubId: Number(player.userId),
    followingCount: playerProfile?._count.following ?? 0,
    sessionCount: player._count.rosters,
    isFollowing: !!isFollowing,
    regularPlay: quick ? null : regularPlay,
    reclubKudos: [],
    myKudos: {
      ...kudosResult,
      myReactions: myKudos.map(k => k.type)
    },
    streakData,
  })
}

