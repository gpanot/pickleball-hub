import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { resolveSquadWaitlistPlayer } from '@/lib/squad-waitlist-player'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const squadName = body?.squadName
  const emoji = body?.emoji
  const country = body?.country
  const city = body?.city
  const friendCount = body?.friendCount

  if (!squadName || !emoji || !country || !city) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const user = await getMobileUser(req)
  const player = await resolveSquadWaitlistPlayer(user, {
    playerName: body?.playerName,
    playerEmail: body?.playerEmail,
    playerDupr:
      body?.playerDupr != null && body.playerDupr !== ''
        ? Number(body.playerDupr)
        : null,
  })

  await prisma.squadWaitlist.create({
    data: {
      squadName: String(squadName),
      emoji: String(emoji),
      country: String(country),
      city: String(city),
      friendCount: Number(friendCount ?? 0),
      profileId: player.profileId,
      playerName: player.playerName,
      playerEmail: player.playerEmail,
      playerDupr: player.playerDupr,
    },
  })

  return NextResponse.json({ ok: true })
}
