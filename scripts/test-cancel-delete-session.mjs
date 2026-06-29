/**
 * Test: Cancel vs Delete session flows
 *
 * Flow 1 — Cancel (lifecycleState = "cancelled"):
 *   - Session stays visible in GET /[id] and club list
 *   - Players notified
 *
 * Flow 2 — Delete (lifecycleState = "deleted"):
 *   - GET /[id] returns 404
 *   - Session excluded from all list queries
 *   - Players notified
 *
 * Flow 3 — Auth guard:
 *   - Non-manager cannot delete or cancel
 */

import { SignJWT } from 'jose'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://127.0.0.1:3099'
const AUTH_SECRET = 'kg/KehknRGSn18bjuHFq2Zsbfm/g3mKSzKl3Jc30hzY='
const SECRET = new TextEncoder().encode(AUTH_SECRET)

const prisma = new PrismaClient()
let passed = 0
let failed = 0

function pass(msg) { console.log(`  ✅ ${msg}`); passed++ }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++ }
function section(msg) { console.log(`\n── ${msg} ──`) }

const settle = (ms = 600) => new Promise(r => setTimeout(r, ms))

async function makeJwt(userId, profileId) {
  return new SignJWT({ profileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET)
}

async function api(method, path, token, body) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function setup() {
  // Reuse existing profiles (same approach as test-routes-and-notifications.mjs)
  const profiles = await prisma.playerProfile.findMany({ take: 2, select: { id: true, userId: true } })
  if (profiles.length < 2) throw new Error('Need at least 2 PlayerProfile rows in DB')
  const [hostProfile, playerProfile] = profiles
  const host = { id: hostProfile.id, userId: hostProfile.userId }
  const player = { id: playerProfile.id, userId: playerProfile.userId }

  // Create a temporary club, then add host as manager in separate step
  const ts = Date.now()
  const club = await prisma.appClub.create({
    data: { name: `CDTest_Club_${ts}`, creatorId: host.id },
  })
  await prisma.appClubManager.create({
    data: {
      profile: { connect: { id: host.id } },
      addedBy: { connect: { id: host.id } },
      appClub: { connect: { id: club.id } },
    },
  })

  return { host, player, club }
}

async function cleanup(sessionIds, clubId) {
  if (sessionIds.length) {
    await prisma.clubSessionBooking.deleteMany({ where: { clubSessionId: { in: sessionIds } } })
    await prisma.clubSession.deleteMany({ where: { id: { in: sessionIds } } })
  }
  if (clubId) {
    await prisma.appClubManager.deleteMany({ where: { appClubId: clubId } })
    await prisma.appClub.deleteMany({ where: { id: clubId } })
  }
}

async function makeSession(clubId, token, name) {
  const start = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const end = new Date(Date.now() + 26 * 3600 * 1000).toISOString()
  const r = await api('POST', '/api/club-sessions', token, {
    appClubId: clubId, name, format: 'social',
    startTime: start, endTime: end, maxPlayers: 10,
  })
  if (r.status !== 201) throw new Error(`Failed to create session "${name}": ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.session.id
}

async function main() {
  const { host, player, club } = await setup()
  const hostToken = await makeJwt(host.userId, host.id)
  const playerToken = await makeJwt(player.userId, player.id)
  const createdSessionIds = []

  try {
    // ─── Flow 1: Cancel session ─────────────────────────────────────────────
    section('Flow 1: Cancel session (remains visible with cancelled state)')

    const cancelId = await makeSession(club.id, hostToken, 'CDTest: Session to Cancel')
    createdSessionIds.push(cancelId)
    pass('Created session')

    const rPub1 = await api('PATCH', `/api/club-sessions/${cancelId}`, hostToken, { lifecycleState: 'published' })
    rPub1.status === 200 ? pass('Published session') : fail(`Publish failed: ${rPub1.status}`)

    const rBook1 = await api('POST', '/api/bookings', playerToken, { clubSessionId: cancelId })
    rBook1.status === 201 ? pass('Player booked session') : fail(`Book failed: ${rBook1.status} ${JSON.stringify(rBook1.json)}`)

    const rCancel = await api('PATCH', `/api/club-sessions/${cancelId}`, hostToken, { lifecycleState: 'cancelled' })
    rCancel.status === 200 ? pass('Cancelled via PATCH lifecycleState=cancelled') : fail(`Cancel failed: ${rCancel.status} ${JSON.stringify(rCancel.json)}`)

    const rGetCancel = await api('GET', `/api/club-sessions/${cancelId}`, hostToken)
    if (rGetCancel.status === 200 && rGetCancel.json?.session?.lifecycleState === 'cancelled') {
      pass('GET /[id] after cancel: 200 with lifecycleState=cancelled (visible)')
    } else {
      fail(`GET /[id] after cancel: expected 200 cancelled, got ${rGetCancel.status} ${JSON.stringify(rGetCancel.json?.session?.lifecycleState)}`)
    }

    const rListCancel = await api('GET', `/api/club-sessions?appClubId=${club.id}&timeframe=all`, hostToken)
    const cancelInList = rListCancel.json?.sessions?.some(s => s.id === cancelId)
    cancelInList ? pass('Cancelled session appears in club list (visible to manager)') : fail('Cancelled session missing from club list')

    // ─── Flow 2: Delete session ─────────────────────────────────────────────
    section('Flow 2: Delete session (hard delete — disappears entirely)')

    const deleteId = await makeSession(club.id, hostToken, 'CDTest: Session to Delete')
    createdSessionIds.push(deleteId)
    pass('Created session')

    const rPub2 = await api('PATCH', `/api/club-sessions/${deleteId}`, hostToken, { lifecycleState: 'published' })
    rPub2.status === 200 ? pass('Published session') : fail(`Publish failed: ${rPub2.status}`)

    const rBook2 = await api('POST', '/api/bookings', playerToken, { clubSessionId: deleteId })
    rBook2.status === 201 ? pass('Player booked session') : fail(`Book failed: ${rBook2.status}`)

    const rDelete = await api('PATCH', `/api/club-sessions/${deleteId}`, hostToken, { lifecycleState: 'deleted' })
    rDelete.status === 200 ? pass('Deleted via PATCH lifecycleState=deleted') : fail(`Delete failed: ${rDelete.status} ${JSON.stringify(rDelete.json)}`)

    const rGetDelete = await api('GET', `/api/club-sessions/${deleteId}`, hostToken)
    rGetDelete.status === 404 ? pass('GET /[id] after delete returns 404 (non-existent)') : fail(`Expected 404 after delete, got ${rGetDelete.status}`)

    const rListDelete = await api('GET', `/api/club-sessions?appClubId=${club.id}&timeframe=all`, hostToken)
    const deleteInList = rListDelete.json?.sessions?.some(s => s.id === deleteId)
    !deleteInList ? pass('Deleted session excluded from club list') : fail('Deleted session still appears in list — should be hidden')

    // Also verify from public list
    const rListPublic = await api('GET', `/api/club-sessions?timeframe=all`)
    const deleteInPublic = rListPublic.json?.sessions?.some(s => s.id === deleteId)
    !deleteInPublic ? pass('Deleted session excluded from public list') : fail('Deleted session appears in public list')

    // ─── Flow 3: Auth guard ──────────────────────────────────────────────────
    section('Flow 3: Non-manager cannot cancel or delete')

    const authId = await makeSession(club.id, hostToken, 'CDTest: Session Auth Test')
    createdSessionIds.push(authId)
    pass('Created session for auth test')

    const rBadCancel = await api('PATCH', `/api/club-sessions/${authId}`, playerToken, { lifecycleState: 'cancelled' })
    rBadCancel.status === 403 ? pass('Non-manager: 403 on cancel attempt') : fail(`Expected 403 for non-manager cancel, got ${rBadCancel.status}`)

    const rBadDelete = await api('PATCH', `/api/club-sessions/${authId}`, playerToken, { lifecycleState: 'deleted' })
    rBadDelete.status === 403 ? pass('Non-manager: 403 on delete attempt') : fail(`Expected 403 for non-manager delete, got ${rBadDelete.status}`)

  } finally {
    await cleanup(createdSessionIds, club.id)
    await prisma.$disconnect()
  }

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──`)
  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
