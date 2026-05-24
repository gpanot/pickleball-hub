import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { toPlayerId, type, feedItemId } = await req.json() as {
    toPlayerId: string
    type: 'fistbump' | 'flame' | 'star'
    feedItemId?: string
  }

  if (!toPlayerId || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const toId = BigInt(toPlayerId)

  try {
    await prisma.kudos.create({
      data: {
        fromPlayerId: user.profileId,
        toPlayerId: toId,
        type,
        feedItemId: feedItemId ?? null,
      }
    })

    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/kudos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPlayerId: user.profileId, toPlayerId, type })
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.code === 'P2002') {
      await prisma.kudos.deleteMany({
        where: {
          fromPlayerId: user.profileId,
          toPlayerId: toId,
          type,
          feedItemId: feedItemId ?? null,
        }
      })
      return NextResponse.json({ ok: true, removed: true })
    }
    throw err
  }
}

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const toPlayerId = searchParams.get('toPlayerId')
  const feedItemId = searchParams.get('feedItemId')

  if (!toPlayerId) {
    return NextResponse.json({ error: 'Missing toPlayerId' }, { status: 400 })
  }

  const toId = BigInt(toPlayerId)

  const [counts, myKudos] = await Promise.all([
    prisma.kudos.groupBy({
      by: ['type'],
      where: {
        toPlayerId: toId,
        ...(feedItemId ? { feedItemId } : {})
      },
      _count: { type: true }
    }),
    prisma.kudos.findMany({
      where: {
        fromPlayerId: user.profileId,
        toPlayerId: toId,
        ...(feedItemId ? { feedItemId } : {})
      },
      select: { type: true }
    })
  ])

  const totals: Record<string, number> = { fistbump: 0, flame: 0, star: 0 }
  counts.forEach(c => {
    totals[c.type] = c._count.type
  })

  return NextResponse.json({
    ...totals,
    myReactions: myKudos.map(k => k.type)
  })
}
