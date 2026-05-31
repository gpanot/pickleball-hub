import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushNotification } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  const { fromPlayerId, toPlayerId, type } = await req.json()

  const [sender, target] = await Promise.all([
    prisma.playerProfile.findUnique({
      where: { id: fromPlayerId },
      select: { displayName: true }
    }),
    prisma.playerProfile.findFirst({
      where: { reclubUserId: BigInt(toPlayerId) },
      select: { id: true, pushToken: true, pushTokenIos: true }
    })
  ])

  if (!target?.pushToken && !target?.pushTokenIos) return NextResponse.json({ ok: true })

  const emojiMap: Record<string, string> = {
    fistbump: '🤜',
    flame: '🔥',
    star: '⭐'
  }
  const labelMap: Record<string, string> = {
    fistbump: 'gave you a fist bump',
    flame: 'thinks you are on fire',
    star: 'gave you a star'
  }

  const name = sender?.displayName ?? 'Someone in your circle'

  await sendPushNotification(target.id, {
    title: `${emojiMap[type]} ${name} ${labelMap[type]}`,
    body: 'Open Squadd to see your kudos',
    data: { type: 'kudos', screen: 'Circle' }
  })

  return NextResponse.json({ ok: true })
}
