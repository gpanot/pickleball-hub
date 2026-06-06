import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { notifyGearSetup } from '@/lib/notifications/pn8-gear-setup'

const EMPTY_GEAR = { gender: null, cap: null, shirt: null, paddle: null, shoes: null, setupComplete: false }
const VALID_GEAR_KEYS = ['cap', 'shirt', 'paddle', 'shoes'] as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (user.profileId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [gear, profile] = await Promise.all([
      prisma.playerGear.findUnique({
        where: { profileId: id },
        select: { cap: true, shirt: true, paddle: true, shoes: true, setupCompletedAt: true },
      }),
      prisma.playerProfile.findUnique({ where: { id }, select: { gender: true } }),
    ])

    const gender = profile?.gender ?? null

    if (!gear) {
      return NextResponse.json({ ...EMPTY_GEAR, gender })
    }

    const setupComplete =
      gear.setupCompletedAt != null ||
      (gear.cap != null && gear.shirt != null && gear.paddle != null && gear.shoes != null)

    return NextResponse.json({ ...gear, gender, setupComplete })
  } catch (err) {
    console.error('[GET /api/players/[id]/gear]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (user.profileId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()

    // gender lives on PlayerProfile, not PlayerGear — update it separately if provided
    const genderValue = typeof body.gender === 'string' && body.gender.trim() ? body.gender.trim() : undefined

    const data: Record<string, string | null> = {}
    for (const key of VALID_GEAR_KEYS) {
      const val = body[key]
      data[key] = typeof val === 'string' && val.trim() ? val.trim() : null
    }

    const allFilled = data.cap != null && data.shirt != null && data.paddle != null && data.shoes != null

    const ops: Promise<unknown>[] = [
      prisma.playerGear.upsert({
        where: { profileId: id },
        update: {
          ...data,
          ...(allFilled ? { setupCompletedAt: new Date() } : {}),
        },
        create: {
          profileId: id,
          ...data,
          ...(allFilled ? { setupCompletedAt: new Date() } : {}),
        },
        select: { cap: true, shirt: true, paddle: true, shoes: true, setupCompletedAt: true },
      }),
    ]

    if (genderValue) {
      ops.push(prisma.playerProfile.update({ where: { id }, data: { gender: genderValue } }))
    }

    const [gear] = (await Promise.all(ops)) as [
      { cap: string | null; shirt: string | null; paddle: string | null; shoes: string | null; setupCompletedAt: Date | null },
      ...unknown[]
    ]

    const setupComplete = gear.setupCompletedAt != null || allFilled

    if (setupComplete) {
      void notifyGearSetup({
        profileId: id,
        gear: { cap: gear.cap, shirt: gear.shirt, paddle: gear.paddle, shoes: gear.shoes },
      }).catch((err) => console.error('[PN8] gear notify error:', err))
    }

    return NextResponse.json({ ...gear, gender: genderValue ?? null, setupComplete })
  } catch (err) {
    console.error('[PUT /api/players/[id]/gear]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
