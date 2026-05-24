import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { reclubAvatarUrl } from '@/lib/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const targetId = BigInt(id)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [player, isFollowing, recentRosters, playerProfile, kudosCounts, myKudos] = await Promise.all([
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
    prisma.sessionRoster.findMany({
      where: {
        userId: targetId,
        session: { startTime: { gte: thirtyDaysAgo } }
      },
      select: {
        session: {
          select: {
            startTime: true,
            club: { select: { name: true } }
          }
        }
      },
      orderBy: { session: { startTime: 'desc' } },
      take: 20
    }),
    prisma.playerProfile.findUnique({
      where: { reclubUserId: targetId },
      select: { _count: { select: { following: true } } }
    }),
    prisma.kudos.groupBy({
      by: ['type'],
      where: { toPlayerId: targetId },
      _count: { type: true }
    }).catch(() => []),
    prisma.kudos.findMany({
      where: { fromPlayerId: user.profileId, toPlayerId: targetId },
      select: { type: true }
    }).catch(() => []),
  ])

  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const venueMap = new Map<string, { count: number; lastSeen: string }>()
  for (const r of recentRosters) {
    const name = r.session.club.name
    const existing = venueMap.get(name)
    if (existing) {
      existing.count++
    } else {
      venueMap.set(name, { count: 1, lastSeen: r.session.startTime })
    }
  }

  const recentVenues = Array.from(venueMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
    .map(([name, v]) => ({
      name,
      count: v.count,
      lastSeen: formatRelative(v.lastSeen)
    }))

  const kudosResult: Record<string, number> = { fistbump: 0, flame: 0, star: 0 }
  for (const k of kudosCounts) {
    if (k.type in kudosResult) {
      kudosResult[k.type] = k._count.type
    }
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
    recentVenues,
    reclubKudos: [],
    myKudos: {
      ...kudosResult,
      myReactions: myKudos.map(k => k.type)
    }
  })
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}
