import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: targetProfileId } = await params

  if (targetProfileId === user.profileId) {
    return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })
  }

  // Verify target profile exists
  const target = await prisma.playerProfile.findUnique({
    where: { id: targetProfileId },
    select: { id: true, reclubUserId: true },
  })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await prisma.block.upsert({
    where: {
      blockerId_blockedId: {
        blockerId: user.profileId,
        blockedId: targetProfileId,
      },
    },
    create: { blockerId: user.profileId, blockedId: targetProfileId },
    update: {},
  })

  // Sever follows in both directions
  const severedConditions = [
    { followerId: user.profileId, ...(target.reclubUserId ? { followeeId: target.reclubUserId } : { followeeId: BigInt(-1) }) },
  ]
  if (user.reclubUserId) {
    severedConditions.push({ followerId: targetProfileId, followeeId: user.reclubUserId })
  }

  await prisma.follow.deleteMany({
    where: { OR: severedConditions },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: targetProfileId } = await params

  await prisma.block.deleteMany({
    where: { blockerId: user.profileId, blockedId: targetProfileId },
  })

  return NextResponse.json({ success: true })
}
