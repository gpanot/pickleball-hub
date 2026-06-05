import type { Metadata } from 'next'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'

export const metadata: Metadata = { title: 'Squadd Waitlist' }
export const dynamic = 'force-dynamic'

const COUNTRY_FLAGS: Record<string, string> = {
  Vietnam: '🇻🇳',
  Philippines: '🇵🇭',
  Malaysia: '🇲🇾',
}

function formatVnTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AdminSquaddPage() {
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login?next=/admin/squadd')
  }

  const rows = await prisma.squadWaitlist.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const byCountry = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.country] = (acc[r.country] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Squadd Waitlist</h1>
          <p className="text-gray-400 text-sm mt-1">
            {rows.length} founding squad reservation{rows.length !== 1 ? 's' : ''}
          </p>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            {Object.entries(byCountry).map(([country, count]) => (
              <div
                key={country}
                className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2 text-sm"
              >
                <span className="mr-2">{COUNTRY_FLAGS[country] ?? '🌏'}</span>
                <span className="text-gray-300">{country}</span>
                <span className="ml-2 font-semibold text-emerald-400">{count}</span>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center py-20 text-gray-500 rounded-xl border border-gray-800">
            No registrations yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Squad</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">DUPR</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-800/60 last:border-0 hover:bg-gray-900/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl leading-none">{row.emoji}</span>
                        <span className="font-medium text-white">{row.squadName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white">{row.playerName ?? '—'}</div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        {row.playerEmail ?? 'no email'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {row.playerDupr != null ? Number(row.playerDupr).toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      <span className="mr-1.5">{COUNTRY_FLAGS[row.country] ?? '🌏'}</span>
                      {row.city}, {row.country}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {formatVnTime(row.createdAt.toISOString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
