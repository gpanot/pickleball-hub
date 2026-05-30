import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

const VALID_REASONS = ['fake_account', 'inappropriate', 'harassment', 'other']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: targetProfileId } = await params

  if (targetProfileId === user.profileId) {
    return NextResponse.json({ error: 'Cannot report yourself' }, { status: 400 })
  }

  const target = await prisma.playerProfile.findUnique({
    where: { id: targetProfileId },
    select: { id: true },
  })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const { reason, detail } = body as { reason?: string; detail?: string }

  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  await prisma.report.upsert({
    where: {
      reporterId_reportedId: {
        reporterId: user.profileId,
        reportedId: targetProfileId,
      },
    },
    create: {
      reporterId: user.profileId,
      reportedId: targetProfileId,
      reason,
      detail: detail ?? null,
    },
    update: {
      reason,
      detail: detail ?? null,
      status: 'pending',
    },
  })

  const reportCount = await prisma.report.count({
    where: { reportedId: targetProfileId, status: 'pending' },
  })

  if (reportCount >= 5) {
    await prisma.playerProfile.update({
      where: { id: targetProfileId },
      data: { reportFlaggedAt: new Date() },
    })
  }

  return NextResponse.json({ success: true })
}
