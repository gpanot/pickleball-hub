'use client'

import { useState } from 'react'

type ReportedUser = {
  id: string
  displayName: string
  imageUrl: string | null
  reportFlaggedAt: string | null
  suspended: boolean
  banned: boolean
  reportCount: number
}

type ReportRow = {
  id: string
  reason: string
  detail: string | null
  createdAt: string
  reporter: { displayName: string; imageUrl: string | null }
  reported: ReportedUser
}

const REASON_LABELS: Record<string, string> = {
  fake_account: 'Fake account',
  inappropriate: 'Inappropriate',
  harassment: 'Harassment',
  other: 'Other',
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className="w-8 h-8 rounded-full object-cover" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-300">
      {name[0]?.toUpperCase()}
    </div>
  )
}

export function ReportsTable({ reports: initial }: { reports: ReportRow[] }) {
  const [reports, setReports] = useState(initial)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleAction = async (
    reportId: string,
    action: 'dismiss' | 'suspend' | 'ban',
  ) => {
    setLoadingId(reportId)
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        credentials: 'include',
      })
      if (!res.ok) {
        alert('Action failed')
        return
      }
      setReports((prev) => prev.filter((r) => r.id !== reportId))
    } catch {
      alert('Network error')
    } finally {
      setLoadingId(null)
    }
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        No pending reports.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3">Reporter</th>
            <th className="text-left px-4 py-3">Reported</th>
            <th className="text-left px-4 py-3">Reason</th>
            <th className="text-left px-4 py-3">Date</th>
            <th className="text-left px-4 py-3">Reports</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const isFlagged = !!report.reported.reportFlaggedAt
            const isLoading = loadingId === report.id
            return (
              <tr key={report.id} className="border-b border-gray-800/50 hover:bg-gray-900/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar url={report.reporter.imageUrl} name={report.reporter.displayName} />
                    <span className="text-gray-300">{report.reporter.displayName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar url={report.reported.imageUrl} name={report.reported.displayName} />
                    <div>
                      <span className="text-white font-medium">{report.reported.displayName}</span>
                      <div className="flex gap-1 mt-0.5">
                        {report.reported.suspended && (
                          <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded">
                            Suspended
                          </span>
                        )}
                        {report.reported.banned && (
                          <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">
                            Banned
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-300">{REASON_LABELS[report.reason] ?? report.reason}</span>
                  {report.detail && (
                    <p className="text-gray-500 text-xs mt-0.5 max-w-xs truncate">{report.detail}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                  {new Date(report.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-300 font-medium">{report.reported.reportCount}</span>
                    {isFlagged && (
                      <span
                        className="text-xs bg-red-900/60 text-red-400 px-1.5 py-0.5 rounded font-semibold"
                        title="Flagged: 5+ unique reports">
                        ⚠ 5+
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(report.id, 'dismiss')}
                      disabled={isLoading}
                      className="text-xs px-2.5 py-1 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40 transition">
                      Dismiss
                    </button>
                    <button
                      onClick={() => handleAction(report.id, 'suspend')}
                      disabled={isLoading || report.reported.suspended}
                      className="text-xs px-2.5 py-1 rounded border border-yellow-800 text-yellow-500 hover:bg-yellow-900/30 disabled:opacity-40 transition">
                      Suspend
                    </button>
                    <button
                      onClick={() => handleAction(report.id, 'ban')}
                      disabled={isLoading || report.reported.banned}
                      className="text-xs px-2.5 py-1 rounded border border-red-800 text-red-500 hover:bg-red-900/30 disabled:opacity-40 transition">
                      Ban
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
