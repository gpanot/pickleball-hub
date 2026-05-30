import type { Metadata } from 'next'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ReportsTable } from './ReportsTable'

export const metadata: Metadata = { title: 'Reports Queue' }
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login?next=/admin/reports')
  }

  const reports = await prisma.report.findMany({
    where: { status: 'pending' },
    include: {
      reporter: {
        select: { displayName: true, reclubPlayer: { select: { imageUrl: true } } },
      },
      reported: {
        select: {
          id: true,
          displayName: true,
          reportFlaggedAt: true,
          suspended: true,
          banned: true,
          reclubPlayer: { select: { imageUrl: true } },
          _count: { select: { reportsReceived: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const serialized = reports.map((r) => ({
    id: r.id,
    reason: r.reason,
    detail: r.detail ?? null,
    createdAt: r.createdAt.toISOString(),
    reporter: {
      displayName: r.reporter.displayName ?? 'Unknown',
      imageUrl: r.reporter.reclubPlayer?.imageUrl ?? null,
    },
    reported: {
      id: r.reported.id,
      displayName: r.reported.displayName ?? 'Unknown',
      imageUrl: r.reported.reclubPlayer?.imageUrl ?? null,
      reportFlaggedAt: r.reported.reportFlaggedAt?.toISOString() ?? null,
      suspended: r.reported.suspended,
      banned: r.reported.banned,
      reportCount: r.reported._count.reportsReceived,
    },
  }))

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Reports Queue</h1>
          <p className="text-gray-400 text-sm mt-1">
            {serialized.length} pending report{serialized.length !== 1 ? 's' : ''}
          </p>
        </div>
        <ReportsTable reports={serialized} />
      </div>
    </div>
  )
}
