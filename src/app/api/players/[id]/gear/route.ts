import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

const EMPTY_GEAR = { cap: null, shirt: null, paddle: null, shoes: null }
const VALID_KEYS = ['cap', 'shirt', 'paddle', 'shoes'] as const

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
      select: { cap: true, shirt: true, paddle: true, shoes: true },
    })
    return NextResponse.json(gear ?? EMPTY_GEAR)
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

    const gear = await prisma.playerGear.upsert({
      where: { profileId: id },
      update: data,
      create: { profileId: id, ...data },
      select: { cap: true, shirt: true, paddle: true, shoes: true },
    })
    return NextResponse.json(gear)
  } catch (err) {
    console.error('[PUT /api/players/[id]/gear]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
