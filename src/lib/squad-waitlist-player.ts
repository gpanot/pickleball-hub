import { prisma } from '@/lib/db'
import type { MobileUser } from '@/lib/mobile-auth'

export type SquadWaitlistPlayer = {
  profileId: string | null
  playerName: string | null
  playerEmail: string | null
  playerDupr: number | null
}

async function resolveDupr(
  profileId: string,
  reclubUserId: bigint | null,
  preferences: unknown,
): Promise<number | null> {
  const prefs = (preferences as Record<string, unknown>) ?? {}
  const rawDupr = prefs.dupr
  const prefsDupr =
    typeof rawDupr === 'number'
      ? rawDupr
      : typeof rawDupr === 'string' && rawDupr !== ''
        ? parseFloat(rawDupr) || null
        : null

  let reclubDupr: number | null = null
  if (reclubUserId) {
    const player = await prisma.player.findUnique({
      where: { userId: reclubUserId },
      select: { duprDoubles: true },
    })
    reclubDupr = player?.duprDoubles != null ? Number(player.duprDoubles) : null
  }

  return reclubDupr ?? prefsDupr
}

export async function resolveSquadWaitlistPlayer(
  user: MobileUser | null,
  body?: {
    playerName?: string
    playerEmail?: string
    playerDupr?: number | null
  },
): Promise<SquadWaitlistPlayer> {
  if (user) {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      include: { user: { select: { name: true, email: true } } },
    })

    if (profile) {
      const playerDupr = await resolveDupr(
        profile.id,
        profile.reclubUserId,
        profile.preferences,
      )

      const authUser = profile.user

      return {
        profileId: profile.id,
        playerName:
          profile.displayName ?? authUser?.name ?? body?.playerName ?? null,
        playerEmail: authUser?.email ?? body?.playerEmail ?? null,
        playerDupr: playerDupr ?? body?.playerDupr ?? null,
      }
    }
  }

  return {
    profileId: null,
    playerName: body?.playerName ?? null,
    playerEmail: body?.playerEmail ?? null,
    playerDupr: body?.playerDupr ?? null,
  }
}
