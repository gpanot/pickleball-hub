import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const squadName = body?.squadName
  const emoji = body?.emoji
  const friendCount = body?.friendCount

  if (!squadName || !emoji || friendCount == null) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  await prisma.squadWaitlist.create({
    data: {
      squadName: String(squadName),
      emoji: String(emoji),
      friendCount: Number(friendCount),
    },
  })

  return NextResponse.json({ ok: true })
}
