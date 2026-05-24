import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { sendPushNotification } from '@/lib/notifications'

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

    // Fire push notification without blocking the response
    sendKudosNotification(user.profileId, toPlayerId, type)

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

const emojiMap: Record<string, string> = { fistbump: '🤜', flame: '🔥', star: '⭐' }
const labelMap: Record<string, string> = {
  fistbump: 'gave you a fist bump',
  flame: 'thinks you are on fire',
  star: 'gave you a star',
}

async function sendKudosNotification(fromProfileId: string, toPlayerId: string, type: string) {
  try {
    const [sender, target] = await Promise.all([
      prisma.playerProfile.findUnique({
        where: { id: fromProfileId },
        select: { displayName: true },
      }),
      prisma.playerProfile.findFirst({
        where: { reclubUserId: BigInt(toPlayerId) },
        select: { pushToken: true },
      }),
    ])

    if (!target?.pushToken) return

    await sendPushNotification({
      token: target.pushToken,
      title: `${emojiMap[type] ?? '👏'} ${sender?.displayName ?? 'Someone'} ${labelMap[type] ?? 'sent you kudos'}`,
      body: 'Open Squadd to see your kudos',
      data: { type: 'kudos', screen: 'Circle' },
    })
  } catch (err) {
    console.error('[kudos] sendKudosNotification failed:', err)
  }
}
