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
  startTime: Date
  endTime: Date
  players: LivePlayer[]
  totalRoster: number
  nextSessionTime: Date | null
}

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true }
  })

  if (follows.length === 0) {
    return NextResponse.json({ liveVenues: [], totalLive: 0 })
  }

  const followeeIds = follows.map(f => f.followeeId)
  const now = new Date()

  const liveRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: {
        startTime: { lte: now },
        endTime: { gte: now }
      }
    },
    include: {
      player: {
        select: {
          id: true,
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
          clubId: true,
          club: { select: { name: true } },
          _count: { select: { rosters: true } }
        }
      }
    }
  })

  if (liveRosters.length === 0) {
    return NextResponse.json({ liveVenues: [], totalLive: 0 })
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
        players: [],
        totalRoster: r.session._count.rosters,
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
  }

  const liveVenues = Array.from(venueMap.values())
    .sort((a, b) => b.players.length - a.players.length)

  const totalLive = new Set(liveRosters.map(r => r.userId)).size

  return NextResponse.json({
    liveVenues: liveVenues.map(v => ({
      venueName: v.venueName,
      sessionId: v.sessionId,
      startTime: v.startTime.toISOString(),
      endTime: v.endTime.toISOString(),
      players: v.players.slice(0, 4),
      totalRoster: v.totalRoster,
      circleCount: v.players.length,
      nextSessionTime: v.nextSessionTime?.toISOString() ?? null
    })),
    totalLive
  })
}
