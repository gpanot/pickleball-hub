/**
 * Profile delete — club & session wipe test
 *
 * Verifies DELETE /api/profile/delete removes founded clubs, hosted sessions,
 * and manager rows so the user can truly restart from scratch.
 *
 * Run: node scripts/test-profile-delete-clubs.mjs
 * Requires: local dev server on http://127.0.0.1:3099
 */
import { SignJWT } from 'jose'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const BASE = 'http://127.0.0.1:3099'
const AUTH_SECRET = 'kg/KehknRGSn18bjuHFq2Zsbfm/g3mKSzKl3Jc30hzY='
const SECRET = new TextEncoder().encode(AUTH_SECRET)
const prisma = new PrismaClient()

let passed = 0
let failed = 0

function pass(msg) { console.log(`  ✅ ${msg}`); passed++ }
function fail(msg, detail = '') {
  console.error(`  ❌ ${detail ? `${msg} — ${detail}` : msg}`)
  failed++
}
function assert(cond, msg, detail = '') { cond ? pass(msg) : fail(msg, detail) }

async function makeJwt(userId, profileId) {
  return new SignJWT({ profileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('2h')
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

async function createDisposableUser() {
  const suffix = randomUUID().slice(0, 8)
  const email = `delete-test-${suffix}@example.com`
  const user = await prisma.user.create({
    data: {
      email,
      name: `Delete Test ${suffix}`,
      image: null,
    },
  })
  const profile = await prisma.playerProfile.create({
    data: {
      userId: user.id,
      displayName: `Delete Test ${suffix}`,
      onboardingCompleted: true,
    },
  })
  const token = await makeJwt(user.id, profile.id)
  return { user, profile, token }
}

async function run() {
  console.log('\n╔══ Profile delete — clubs & sessions ══\n')

  const { user, profile, token } = await createDisposableUser()
  const pid = profile.id

  // Create club
  const clubRes = await api('POST', '/api/app-clubs', token, {
    name: `Delete Test Club ${pid.slice(0, 6)}`,
    privacy: 'public',
  })
  assert(clubRes.status === 201, 'POST /api/app-clubs → 201', `got ${clubRes.status}`)
  const clubId = clubRes.json?.club?.id
  assert(Boolean(clubId), 'club id returned')

  // Create draft session
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  const sessionRes = await api('POST', '/api/club-sessions', token, {
    appClubId: clubId,
    name: 'Delete Test Session',
    format: 'social',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    maxPlayers: 8,
  })
  assert(sessionRes.status === 201, 'POST /api/club-sessions → 201', `got ${sessionRes.status}`)
  const sessionId = sessionRes.json?.session?.id
  assert(Boolean(sessionId), 'session id returned')

  // Sanity: data exists before delete
  const preClub = await prisma.appClub.findUnique({ where: { id: clubId } })
  const preSession = await prisma.clubSession.findUnique({ where: { id: sessionId } })
  assert(preClub != null, 'club exists before delete')
  assert(preSession != null, 'session exists before delete')

  // Delete profile
  const delRes = await api('DELETE', '/api/profile/delete', token)
  assert(delRes.status === 200, 'DELETE /api/profile/delete → 200', `got ${delRes.status} ${JSON.stringify(delRes.json)}`)

  // Verify wipe
  const postClub = await prisma.appClub.findUnique({ where: { id: clubId } })
  const postSession = await prisma.clubSession.findUnique({ where: { id: sessionId } })
  const postProfile = await prisma.playerProfile.findUnique({ where: { id: pid } })
  const postUser = await prisma.user.findUnique({ where: { id: user.id } })
  const postManagers = await prisma.appClubManager.count({ where: { appClubId: clubId } })

  assert(postClub == null, 'club removed after delete')
  assert(postSession == null, 'session removed after delete')
  assert(postProfile == null, 'player profile removed after delete')
  assert(postUser == null, 'user removed after delete')
  assert(postManagers === 0, 'manager rows removed after delete')

  // Fresh start: new user can found a club again
  const fresh = await createDisposableUser()
  const freshClubRes = await api('POST', '/api/app-clubs', fresh.token, {
    name: `Fresh Club ${fresh.profile.id.slice(0, 6)}`,
    privacy: 'public',
  })
  assert(freshClubRes.status === 201, 'fresh user can create club after prior delete', `got ${freshClubRes.status}`)

  // Cleanup fresh disposable data
  await api('DELETE', '/api/profile/delete', fresh.token)

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
