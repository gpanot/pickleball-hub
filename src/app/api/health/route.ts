import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    region: 'ap-southeast1',
    timestamp: new Date().toISOString(),
  })
}
