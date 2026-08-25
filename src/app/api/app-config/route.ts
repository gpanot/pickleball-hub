import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await prisma.appConfig.findMany()
    const result: Record<string, unknown> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch {
    // On DB error, return empty object so the client treats every feature as off
    return NextResponse.json({}, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    })
  }
}
