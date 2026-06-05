import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await prisma.squadWaitlist.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    count: rows.length,
    registrations: rows,
  })
}
