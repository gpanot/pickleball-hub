import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { gender: true },
  })

  if (profile?.gender !== 'female') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!user.reclubUserId) {
    return NextResponse.json({ items: [] })
  }

  const now = new Date()

  // Players I follow (followeeId = their reclubUserId BigInt)
  const myFollows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  })
  const myFollowedReclubIds = new Set(myFollows.map((f) => f.followeeId))

  // Players who follow me back (their reclubUserId follows my reclubUserId)
  const followersOfMe = await prisma.follow.findMany({
    where: {
      followeeId: user.reclubUserId,
      followerId: { not: user.profileId },
    },
    select: {
      followerId: true,
      follower: {
        select: {
          id: true,
          reclubUserId: true,
        },
      },
    },
  })

  // Mutual: they follow me AND I follow them (compare reclubUserIds)
  const mutualProfileIds: string[] = []
  for (const f of followersOfMe) {
    const theirReclubId = f.follower?.reclubUserId
    if (theirReclubId && myFollowedReclubIds.has(theirReclubId)) {
      mutualProfileIds.push(f.followerId)
    }
  }

  if (mutualProfileIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  // Block lists — both directions (using profileIds)
  const [blocking, blockedBy] = await Promise.all([
    prisma.block.findMany({
      where: { blockerId: user.profileId },
      select: { blockedId: true },
    }),
    prisma.block.findMany({
      where: { blockedId: user.profileId },
      select: { blockerId: true },
    }),
  ])
  const blockedProfileIds = new Set([
    ...blocking.map((b) => b.blockedId),
    ...blockedBy.map((b) => b.blockerId),
  ])

  const visibleProfileIds = mutualProfileIds.filter((id) => !blockedProfileIds.has(id))

  if (visibleProfileIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const intents = await prisma.playIntent.findMany({
    where: {
      expiresAt: { gt: now },
      profileId: { in: visibleProfileIds },
      profile: { gender: 'female', suspended: false, banned: false },
    },
    include: {
      profile: {
        select: {
          id: true,
          displayName: true,
          reclubUserId: true,
          reclubPlayer: {
            select: {
              imageUrl: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // My own active intent
  const myIntent = await prisma.playIntent.findUnique({
    where: { profileId: user.profileId },
  })

  const items = intents.map((intent) => ({
    profileId: intent.profile.id,
    displayName: intent.profile.displayName ?? 'Player',
    imageUrl: intent.profile.reclubPlayer?.imageUrl ?? null,
    timeSlot: intent.timeSlot,
    date: intent.date,
    // Player lat/lng not stored on profiles; GPS distance not available
    distanceKm: null as number | null,
    zaloNumber: intent.zaloNumber ?? null,
    expiresAt: intent.expiresAt.toISOString(),
  }))

  return NextResponse.json({
    items,
    myActiveIntent: myIntent
      ? {
          timeSlot: myIntent.timeSlot,
          date: myIntent.date,
          zaloNumber: myIntent.zaloNumber ?? null,
          expiresAt: myIntent.expiresAt.toISOString(),
        }
      : null,
  })
}
