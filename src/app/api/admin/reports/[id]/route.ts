import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: reportId } = await params

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, reportedId: true },
  })
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { action } = body as { action?: string }

  if (!action || !['dismiss', 'suspend', 'ban'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  if (action === 'dismiss') {
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'dismissed' },
    })
  } else if (action === 'suspend') {
    await Promise.all([
      prisma.playerProfile.update({
        where: { id: report.reportedId },
        data: { suspended: true },
      }),
      prisma.report.update({
        where: { id: reportId },
        data: { status: 'reviewed' },
      }),
    ])
  } else if (action === 'ban') {
    await Promise.all([
      prisma.playerProfile.update({
        where: { id: report.reportedId },
        data: { banned: true },
      }),
      prisma.report.update({
        where: { id: reportId },
        data: { status: 'reviewed' },
      }),
    ])
  }

  return NextResponse.json({ success: true })
}
