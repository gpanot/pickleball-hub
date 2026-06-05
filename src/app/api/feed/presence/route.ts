import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { reclubAvatarUrl } from '@/lib/utils'

interface LivePlayer {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
}

interface LiveVenue {
  venueName: string
  sessionId: number
  startTime: string
  endTime: string
  eventUrl: string
  players: LivePlayer[]
  totalRoster: number
  circleCount: number
  nextSessionTime: string | null
}

interface UpcomingVenue {
  venueName: string
  sessionId: number
  startTime: string
  endTime: string
  eventUrl: string
  players: LivePlayer[]
  totalRoster: number
  circleCount: number
}

/** "HH:mm" → minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

const UPCOMING_WINDOW_MINS = 8 * 60

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true }
  })

  if (follows.length === 0 && !user.reclubUserId) {
    return NextResponse.json({ liveVenues: [], totalLive: 0, upcomingVenues: [] })
  }

  const followeeIds = follows.map(f => f.followeeId)

  // Include the current user so they see themselves in on-court / upcoming
  if (user.reclubUserId && !followeeIds.includes(user.reclubUserId)) {
    followeeIds.push(user.reclubUserId)
  }

  // Current VN time (UTC+7) as comparable strings
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const todayStr = vnNow.toISOString().slice(0, 10)
  const nowTime = vnNow.toISOString().slice(11, 16) // "HH:mm"

  const liveRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: {
        scrapedDate: todayStr,
        startTime: { lte: nowTime },
        endTime: { gte: nowTime },
      }
    },
      include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true
        }
      },
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          eventUrl: true,
          clubId: true,
          club: { select: { name: true } },
          _count: { select: { rosters: true } }
        }
      }
    }
  })

  // Upcoming: sessions starting in the next 8 hours (minute-based — string
  // comparison breaks when the window crosses midnight, e.g. 17:30 → 01:30)
  const nowMins = timeToMinutes(nowTime)

  const upcomingRostersRaw = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: {
        scrapedDate: todayStr,
        startTime: { gt: nowTime },
      }
    },
    include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        }
      },
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          eventUrl: true,
          club: { select: { name: true } },
          _count: { select: { rosters: true } }
        }
      }
    }
  })

  const upcomingRosters = upcomingRostersRaw.filter((r) => {
    const diff = timeToMinutes(r.session.startTime) - nowMins
    return diff > 0 && diff <= UPCOMING_WINDOW_MINS
  })

  const upcomingMap = new Map<number, UpcomingVenue>()
  for (const r of upcomingRosters) {
    const sessionId = r.session.id
    if (!upcomingMap.has(sessionId)) {
      upcomingMap.set(sessionId, {
        venueName: r.session.club.name,
        sessionId,
        startTime: r.session.startTime,
        endTime: r.session.endTime,
        eventUrl: r.session.eventUrl,
        players: [],
        totalRoster: r.session._count.rosters,
        circleCount: 0,
      })
    }
    const venue = upcomingMap.get(sessionId)!
    venue.players.push({
      userId: String(r.player.userId),
      displayName: r.player.displayName,
      imageUrl: r.player.imageUrl ?? reclubAvatarUrl(r.player.userId),
      duprDoubles: r.player.duprDoubles ? Number(r.player.duprDoubles) : null
    })
    venue.circleCount++
  }

  const upcomingVenues = Array.from(upcomingMap.values())
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map(v => ({ ...v, players: v.players.slice(0, 4) }))

  if (liveRosters.length === 0) {
    return NextResponse.json({ liveVenues: [], totalLive: 0, upcomingVenues })
  }

  const venueMap = new Map<number, LiveVenue>()

  for (const r of liveRosters) {
    const sessionId = r.session.id
    if (!venueMap.has(sessionId)) {
      const nextSession = await prisma.session.findFirst({
        where: {
          clubId: r.session.clubId,
          startTime: { gt: r.session.endTime }
        },
        orderBy: { startTime: 'asc' },
        select: { startTime: true }
      })

      venueMap.set(sessionId, {
        venueName: r.session.club.name,
        sessionId,
        startTime: r.session.startTime,
        endTime: r.session.endTime,
        eventUrl: r.session.eventUrl,
        players: [],
        totalRoster: r.session._count.rosters,
        circleCount: 0,
        nextSessionTime: nextSession?.startTime ?? null
      })
    }

    const venue = venueMap.get(sessionId)!
    venue.players.push({
      userId: String(r.player.userId),
      displayName: r.player.displayName,
      imageUrl: r.player.imageUrl ?? reclubAvatarUrl(r.player.userId),
      duprDoubles: r.player.duprDoubles ? Number(r.player.duprDoubles) : null
    })
    venue.circleCount++
  }

  const liveVenues = Array.from(venueMap.values())
    .sort((a, b) => b.players.length - a.players.length)

  const totalLive = new Set(liveRosters.map(r => r.userId)).size

  return NextResponse.json({
    liveVenues: liveVenues.map(v => ({
      venueName: v.venueName,
      sessionId: v.sessionId,
      startTime: v.startTime,
      endTime: v.endTime,
      eventUrl: v.eventUrl,
      players: v.players.slice(0, 4),
      totalRoster: v.totalRoster,
      circleCount: v.circleCount,
      nextSessionTime: v.nextSessionTime ?? null
    })),
    totalLive,
    upcomingVenues,
  })
}
