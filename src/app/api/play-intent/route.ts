import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

function computeExpiresAt(date: string, timeSlot: string): Date {
  const now = new Date()
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const vnDate = vnNow.toISOString().split('T')[0]

  let targetDate = vnDate
  if (date === 'tomorrow') {
    const d = new Date(vnNow)
    d.setDate(d.getDate() + 1)
    targetDate = d.toISOString().split('T')[0]
  } else if (date === 'weekend') {
    const d = new Date(vnNow)
    const day = d.getDay()
    const daysUntilSunday = day === 0 ? 0 : 7 - day
    d.setDate(d.getDate() + daysUntilSunday)
    targetDate = d.toISOString().split('T')[0]
  }

  const endHour = timeSlot === 'morning' ? 12 : timeSlot === 'afternoon' ? 17 : 23
  const endMin = timeSlot === 'evening' ? 59 : 0

  return new Date(
    `${targetDate}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00+07:00`,
  )
}

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { gender: true },
  })

  if (profile?.gender !== 'female') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { timeSlot, date, zaloNumber } = body as {
    timeSlot?: string
    date?: string
    zaloNumber?: string
  }

  if (
    !timeSlot ||
    !['morning', 'afternoon', 'evening'].includes(timeSlot) ||
    !date ||
    !['today', 'tomorrow', 'weekend'].includes(date)
  ) {
    return NextResponse.json({ error: 'Invalid timeSlot or date' }, { status: 400 })
  }

  const expiresAt = computeExpiresAt(date, timeSlot)

  const intent = await prisma.playIntent.upsert({
    where: { profileId: user.profileId },
    create: {
      profileId: user.profileId,
      timeSlot,
      date,
      zaloNumber: zaloNumber ?? null,
      expiresAt,
    },
    update: {
      timeSlot,
      date,
      zaloNumber: zaloNumber ?? null,
      expiresAt,
    },
  })

  return NextResponse.json({ success: true, intent })
}

export async function DELETE(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.playIntent.deleteMany({
    where: { profileId: user.profileId },
  })

  return NextResponse.json({ success: true })
}
