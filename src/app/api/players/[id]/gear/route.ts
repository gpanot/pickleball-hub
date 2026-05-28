import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

const EMPTY_GEAR = { gender: null, cap: null, shirt: null, paddle: null, shoes: null, setupComplete: false }
const VALID_KEYS = ['gender', 'cap', 'shirt', 'paddle', 'shoes'] as const

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
    const gear = await prisma.playerGear.findUnique({
      where: { profileId: id },
      select: { gender: true, cap: true, shirt: true, paddle: true, shoes: true, setupCompletedAt: true },
    })
    if (!gear) return NextResponse.json(EMPTY_GEAR)

    const setupComplete =
      gear.setupCompletedAt != null ||
      (gear.cap != null && gear.shirt != null && gear.paddle != null && gear.shoes != null)

    return NextResponse.json({ ...gear, setupCompletedAt: undefined, setupComplete })
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
    const data: Record<string, string | null> = {}
    for (const key of VALID_KEYS) {
      const val = body[key]
      data[key] = typeof val === 'string' && val.trim() ? val.trim() : null
    }

    const allFilled = data.cap != null && data.shirt != null && data.paddle != null && data.shoes != null

    const gear = await prisma.playerGear.upsert({
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
      select: { gender: true, cap: true, shirt: true, paddle: true, shoes: true, setupCompletedAt: true },
    })

    const setupComplete = gear.setupCompletedAt != null || allFilled

    return NextResponse.json({ ...gear, setupCompletedAt: undefined, setupComplete })
  } catch (err) {
    console.error('[PUT /api/players/[id]/gear]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
