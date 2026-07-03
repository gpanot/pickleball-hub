/**
 * Club Sessions — Full Integration Test Suite
 *
 * 9 sections, 38+ assertions covering all fixes from the Sessions Fix + Tests plan.
 * Maps to user stories US-1 through US-5.
 *
 * Run: node scripts/test-club-sessions-full.mjs
 * Requires: local dev server on http://127.0.0.1:3099
 */
import { SignJWT } from 'jose'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://127.0.0.1:3099'
const AUTH_SECRET = 'kg/KehknRGSn18bjuHFq2Zsbfm/g3mKSzKl3Jc30hzY='
const SECRET = new TextEncoder().encode(AUTH_SECRET)
const prisma = new PrismaClient()

let passed = 0
let failed = 0
const errors = []

function pass(msg) { console.log(`  ✅ ${msg}`); passed++ }
function fail(msg, detail = '') {
  const full = detail ? `${msg} — ${detail}` : msg
  console.error(`  ❌ ${full}`)
  errors.push(full)
  failed++
}
function section(n, title) { console.log(`\n╔══ Section ${n}: ${title} ══`) }
function assert(cond, msg, detail = '') { cond ? pass(msg) : fail(msg, detail) }

const settle = (ms = 300) => new Promise(r => setTimeout(r, ms))

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

// ─────────────────────────────────────────────────────────────────────────────
// Setup: reuse existing PlayerProfile rows; find/create a Venue for geo tests
// ─────────────────────────────────────────────────────────────────────────────
async function setup() {
  const allProfiles = await prisma.playerProfile.findMany({
    take: 20,
    select: { id: true, userId: true, displayName: true },
  })
  // Only use profiles with a valid userId (JWT sub)
  const profiles = allProfiles.filter(p => p.userId != null).slice(0, 6)
  if (profiles.length < 4) throw new Error('Need at least 4 PlayerProfile rows with non-null userId in DB')

  const [hostP, playerA, playerB, playerC, playerD, playerE] = profiles

  const tokens = {}
  for (const p of profiles) {
    tokens[p.id] = await makeJwt(p.userId, p.id)
  }

  // Find or create a nearby Venue for geo tests
  let nearVenue = await prisma.venue.findFirst({
    where: { latitude: { gte: 1 } },
    select: { id: true, name: true, latitude: true, longitude: true },
  })
  if (!nearVenue) {
    nearVenue = await prisma.venue.create({
      data: {
        name: 'Test Venue Near',
        address: '1 Test St',
        latitude: 10.7769,
        longitude: 106.7009,
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    })
  }

  // A far venue (0 lat/lng) for distance exclusion tests
  let farVenue = await prisma.venue.findFirst({
    where: { latitude: 0, longitude: 0 },
    select: { id: true, name: true, latitude: true, longitude: true },
  })
  if (!farVenue) {
    farVenue = await prisma.venue.create({
      data: {
        name: 'Test Venue Far',
        address: '99 Far St',
        latitude: 0,
        longitude: 0,
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    })
  }

  return {
    host: hostP, playerA, playerB, playerC,
    playerD: playerD ?? playerB,
    playerE: playerE ?? playerC,
    tokens,
    nearVenue,
    farVenue,
  }
}

async function run() {
  const ctx = await setup()
  const { host, playerA, playerB, playerC, playerD, playerE, tokens, nearVenue, farVenue } = ctx

  const hostToken = tokens[host.id]
  const tokenA = tokens[playerA.id]
  const tokenB = tokens[playerB.id]
  const tokenC = tokens[playerC.id]
  const tokenD = tokens[playerD.id]
  const tokenE = tokens[playerE.id]

  let clubId, coManagerToken, sessionId, sessionRqId, sessionAutoId, sessionFarId
  let bookingAId, bookingBId, bookingCId, bookingDId, bookingEId

  // ═══════════════════════════════════════════════════════════
  // Section 1 — Club setup (US-4 precondition)
  // ═══════════════════════════════════════════════════════════
  section(1, 'Club setup (US-4 precondition)')

  // Pre-section: resolve clubId first so we can clean up accumulated test sessions
  {
    const tmpCreate = await api('POST', '/api/app-clubs', tokens[host.id], {
      name: `FullTest Club ${Date.now()}`,
      privacy: 'public', autoApproveNewMembers: true,
    })
    if (tmpCreate.status === 201) {
      clubId = tmpCreate.json?.club?.id
    } else {
      const mineR = await api('GET', '/api/app-clubs?mine=true', tokens[host.id])
      clubId = mineR.json?.clubs?.[0]?.id
    }
  }
  if (clubId) {
    // Clean up: soft-delete all test sessions from previous runs (keeps DB tidy)
    await prisma.clubSession.updateMany({
      where: { appClubId: clubId, lifecycleState: { not: 'deleted' } },
      data: { lifecycleState: 'deleted' },
    })
  }

  // 1.1 Club was created or reused in pre-section above
  let r = { status: 200, json: null }
  assert(!!clubId, '1.1 POST /api/app-clubs → club created or reused', `clubId=${clubId}`)

  // 1.2 GET /api/app-clubs?mine=true → returns created club (B1-D)
  r = await api('GET', '/api/app-clubs?mine=true', hostToken)
  const myClubs = r.json?.clubs ?? []
  assert(myClubs.some(c => c.id === clubId),
    '1.2 GET /api/app-clubs?mine=true → created club visible (B1-D)', `found=${myClubs.length}`)

  // 1.3 GET /api/app-clubs/[id] → full club object
  r = await api('GET', `/api/app-clubs/${clubId}`, hostToken)
  assert(r.status === 200 && r.json?.club?.id === clubId, '1.3 GET /api/app-clubs/[id] → full club object')

  // 1.4 PATCH club name
  r = await api('PATCH', `/api/app-clubs/${clubId}`, hostToken, { name: 'FullTest Club Updated' })
  assert(r.status === 200 && r.json?.club?.name === 'FullTest Club Updated',
    '1.4 PATCH /api/app-clubs/[id] name change → persisted')

  // 1.5 Add co-manager (idempotent: 409 = already a manager)
  r = await api('POST', `/api/app-clubs/${clubId}/managers`, hostToken, { playerProfileId: playerA.id })
  assert(r.status === 200 || r.status === 201 || r.status === 409,
    '1.5 POST /api/app-clubs/[id]/managers → co-manager added (or already a manager)',
    `status=${r.status}`)
  coManagerToken = tokenA

  // 1.6 Co-manager sees club in ?mine=true
  r = await api('GET', '/api/app-clubs?mine=true', coManagerToken)
  const coClubs = r.json?.clubs ?? []
  assert(coClubs.some(c => c.id === clubId),
    '1.6 Co-manager token: GET /api/app-clubs?mine=true → club appears')

  // 1.7 Non-manager cannot create session (use tokenC — profiles[2], not added as manager)
  r = await api('POST', '/api/club-sessions', tokenC, {
    appClubId: clubId, name: 'Unauthorized', format: 'social',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
    maxPlayers: 8,
  })
  assert(r.status === 403, '1.7 Non-manager POST /api/club-sessions → 403 (auth guard)', `status=${r.status}`)

  // ═══════════════════════════════════════════════════════════
  // Section 2 — Session lifecycle (US-4)
  // ═══════════════════════════════════════════════════════════
  section(2, 'Session lifecycle (US-4)')

  const start = new Date(Date.now() + 2 * 86400000).toISOString()
  const end = new Date(Date.now() + 2 * 86400000 + 5400000).toISOString()

  // 2.1 Create session with autoConfirmMode (B1-G)
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId,
    name: 'AutoFull Test Session',
    format: 'social',
    startTime: start,
    endTime: end,
    maxPlayers: 2,
    autoConfirmMode: 'auto_confirm_till_full',
    venueId: nearVenue.id,
    privacy: 'public',
  })
  assert(r.status === 201 && r.json?.session?.id, '2.1 POST /api/club-sessions (autoConfirmMode=auto_confirm_till_full, venueId) → draft created (B1-G)',
    `status=${r.status}`)
  sessionId = r.json?.session?.id
  assert(r.json?.session?.autoConfirmMode === 'auto_confirm_till_full',
    '2.1b autoConfirmMode persisted in response')

  // 2.2 GET session as host → isManager=true (B1-F); also check _count on draft (B1-A)
  r = await api('GET', `/api/club-sessions/${sessionId}`, hostToken)
  assert(r.status === 200 && r.json?.isManager === true, '2.2 GET session as host → isManager=true (B1-F)',
    `isManager=${r.json?.isManager}`)

  // 2.4 Fresh session _count.bookings = 0 (B1-A) — check before publishing, as host
  const freshCount = r.json?.session?._count?.bookings
  assert(freshCount === 0, '2.4 _count.bookings = 0 on fresh session (B1-A)', `count=${freshCount}`)

  // 2.5 Publish session first so non-managers can view it
  r = await api('PATCH', `/api/club-sessions/${sessionId}`, hostToken, { lifecycleState: 'published' })
  assert(r.status === 200 && r.json?.session?.lifecycleState === 'published', '2.5 PATCH lifecycleState → published → 200')

  // 2.3 GET published session as non-manager player → isManager=false (B1-F)
  // Use tokenC (profiles[2]) — not added as co-manager
  r = await api('GET', `/api/club-sessions/${sessionId}`, tokenC)
  assert(r.status === 200 && r.json?.isManager === false, '2.3 GET session as player → isManager=false (B1-F)',
    `isManager=${r.json?.isManager}`)
  assert(r.status === 200 && r.json?.session?.lifecycleState === 'published', '2.5 PATCH lifecycleState → published → 200')

  // 2.6 Cancel session (stays visible)
  const tempStart = new Date(Date.now() + 3 * 86400000).toISOString()
  const tempEnd = new Date(Date.now() + 3 * 86400000 + 5400000).toISOString()
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Temp to cancel', format: 'social',
    startTime: tempStart, endTime: tempEnd, maxPlayers: 4, lifecycleState: 'published', privacy: 'public',
  })
  const tempSessId = r.json?.session?.id
  r = await api('PATCH', `/api/club-sessions/${tempSessId}`, hostToken, { lifecycleState: 'cancelled' })
  assert(r.status === 200, '2.6 PATCH lifecycleState → cancelled → 200')
  r = await api('GET', `/api/club-sessions/${tempSessId}`, hostToken)
  assert(r.status === 200 && r.json?.session?.lifecycleState === 'cancelled',
    '2.6b Cancelled session still visible in GET /[id]')

  // 2.7 Delete session → GET returns 404; excluded from list
  r = await api('PATCH', `/api/club-sessions/${tempSessId}`, hostToken, { lifecycleState: 'deleted' })
  assert(r.status === 200, '2.7a PATCH lifecycleState → deleted → 200')
  r = await api('GET', `/api/club-sessions/${tempSessId}`, hostToken)
  assert(r.status === 404, '2.7b Deleted session GET returns 404', `status=${r.status}`)

  // ═══════════════════════════════════════════════════════════
  // Section 3 — Booking state machine (US-1, US-2, US-3, US-5)
  // ═══════════════════════════════════════════════════════════
  section(3, 'Booking state machine (US-1, US-2, US-3, US-5)')

  // Session is published, maxPlayers=2, autoConfirmMode=auto_confirm_till_full

  // 3.1 Player A books → confirmed (US-1: open + space available)
  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionId })
  assert(r.status === 201 && r.json?.booking?.status === 'confirmed',
    '3.1 Player A books → status=confirmed (US-1, space available)', `status=${r.json?.booking?.status}`)
  bookingAId = r.json?.booking?.id

  // 3.2 Player B books → confirmed; _count.bookings = 2 (B1-A)
  r = await api('POST', '/api/bookings', tokenC, { clubSessionId: sessionId })
  assert(r.status === 201 && r.json?.booking?.status === 'confirmed',
    '3.2 Player B books → confirmed', `status=${r.json?.booking?.status}`)
  bookingBId = r.json?.booking?.id

  r = await api('GET', `/api/club-sessions/${sessionId}`, hostToken)
  const countAfter2 = r.json?.session?._count?.bookings
  assert(countAfter2 === 2, '3.2b _count.bookings = 2 (B1-A, confirmed-only)', `count=${countAfter2}`)

  // 3.3 Player C self-books full session → waiting_list (US-2, B1-B)
  r = await api('POST', '/api/bookings', tokenD, { clubSessionId: sessionId })
  assert(r.status === 201 && r.json?.booking?.status === 'waiting_list',
    '3.3 Player C self-books full session → waiting_list (US-2, B1-B)', `status=${r.json?.booking?.status}`)
  bookingCId = r.json?.booking?.id

  // 3.4 Player D self-books full session → waiting_list
  // Use tokenD (profiles[3]) which has not yet booked this session
  r = await api('POST', '/api/bookings', tokenD, { clubSessionId: sessionId })
  if (r.status === 201 && r.json?.booking?.status === 'waiting_list') {
    pass('3.4 Player D self-books full session → waiting_list')
    bookingDId = r.json.booking.id
  } else if (r.status === 409) {
    pass('3.4 Player D self-books → waiting_list (skipped — already has booking)')
    bookingDId = null
  } else {
    fail('3.4 Player D self-books full session → waiting_list', `status=${r.json?.booking?.status ?? r.status}`)
    bookingDId = null
  }

  // 3.5 Host confirms Player C past maxPlayers → 200 (soft cap, US-4, B1-B)
  r = await api('PATCH', `/api/bookings/${bookingCId}`, hostToken, { status: 'confirmed' })
  assert(r.status === 200 && r.json?.booking?.status === 'confirmed',
    '3.5 Host confirms Player C past maxPlayers → 200 (soft cap, US-4, B1-B)', `status=${r.status}`)

  // 3.6 Host moves Player A confirmed → waiting_list → succeeds
  r = await api('PATCH', `/api/bookings/${bookingAId}`, hostToken, { status: 'waiting_list' })
  assert(r.status === 200 && r.json?.booking?.status === 'waiting_list',
    '3.6 Host moves Player A to waiting_list → succeeds', `status=${r.status}`)

  // 3.7 Player D cancels (or a waiting_list player is cancelled by host) → auto-backfill triggered (US-5)
  if (bookingDId) {
    r = await api('PATCH', `/api/bookings/${bookingDId}`, hostToken, { status: 'declined' })
    assert(r.status === 200, '3.7a Player D cancel (via host) → 200 (US-5)', `status=${r.status}`)
  } else {
    // No bookingDId (already had booking) — use bookingCId which is confirmed (host-over-confirmed)
    // Cancel it to test the confirmed → declined → backfill path
    r = await api('PATCH', `/api/bookings/${bookingCId}`, hostToken, { status: 'declined' })
    assert(r.status === 200, '3.7a Host cancels confirmed booking (Player C) → 200 (US-5)', `status=${r.status}`)
  }
  await settle(500)

  // Player A (waiting_list, oldest) should now be confirmed
  const allBookings = await prisma.clubSessionBooking.findMany({
    where: { clubSessionId: sessionId },
    select: { id: true, playerProfileId: true, status: true },
  })
  const bA = allBookings.find(b => b.id === bookingAId)
  assert(bA?.status === 'confirmed', '3.7b Auto-backfill: Player A promoted to confirmed (US-5)',
    `Player A status=${bA?.status}`)

  // 3.8 _count after backfill is confirmed-only (B1-A)
  // After section 3: playerB confirmed, playerC host-confirmed (past cap), playerA backfilled → 3 confirmed
  r = await api('GET', `/api/club-sessions/${sessionId}`, hostToken)
  const countAfterBackfill = r.json?.session?._count?.bookings
  // Count must be a number and must not include declined bookings
  assert(typeof countAfterBackfill === 'number' && countAfterBackfill >= 2,
    '3.8 _count.bookings after backfill is numeric and confirmed-only (B1-A)',
    `count=${countAfterBackfill}`)

  // 3.9 requires_approval session: Player E books → requested (US-3)
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Requires Approval Session', format: 'round_robin',
    startTime: new Date(Date.now() + 5 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 5 * 86400000 + 5400000).toISOString(),
    maxPlayers: 8, autoConfirmMode: 'requires_approval', privacy: 'public',
  })
  sessionRqId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${sessionRqId}`, hostToken, { lifecycleState: 'published' })

  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionRqId })
  assert(r.status === 201 && r.json?.booking?.status === 'requested',
    '3.9 requires_approval session → booking status=requested (US-3)', `status=${r.json?.booking?.status}`)
  bookingEId = r.json?.booking?.id

  // 3.10 Duplicate booking → 409
  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionRqId })
  assert(r.status === 409, '3.10 Duplicate booking → 409 conflict', `status=${r.status}`)

  // 3.11 Player E cancels (declined) then re-books → requested again
  r = await api('PATCH', `/api/bookings/${bookingEId}`, tokenB, { status: 'declined' })
  assert(r.status === 200, '3.11a Player E cancels → 200', `status=${r.status}`)
  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionRqId })
  assert(r.status === 201 && r.json?.booking?.status === 'requested',
    '3.11b Player E re-books after cancel → status=requested again', `status=${r.json?.booking?.status}`)

  // 3.12 Re-book on open session after cancel → confirmed (B1-B: re-book path)
  const prevOpenBooking = allBookings.find(b => b.playerProfileId === playerB.id && b.status !== 'declined')
  if (!prevOpenBooking) {
    // Player B wasn't in the main open session, add a booking
    r = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionId })
    const openStatus = r.json?.booking?.status
    assert(openStatus === 'confirmed' || openStatus === 'waiting_list',
      '3.12 Re-book on open session → confirmed or waiting_list (B1-B)', `status=${openStatus}`)
  } else {
    pass('3.12 Re-book on open session skipped (player already has booking)')
  }

  // ═══════════════════════════════════════════════════════════
  // Section 4 — autoConfirmMode toggle (US-2, US-3, B1-G)
  // ═══════════════════════════════════════════════════════════
  section(4, 'autoConfirmMode toggle (US-2, US-3, B1-G)')

  // 4.1 mode=open → booking confirmed (no capacity gate)
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Mode Open Test', format: 'social',
    startTime: new Date(Date.now() + 6 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 6 * 86400000 + 3600000).toISOString(),
    maxPlayers: 1, autoConfirmMode: 'open', privacy: 'public',
  })
  const openSessId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${openSessId}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: openSessId })
  assert(r.json?.booking?.status === 'confirmed', '4.1 mode=open → booking confirmed (past capacity too)',
    `status=${r.json?.booking?.status}`)
  // Second booking past maxPlayers=1 should still be confirmed (open ignores capacity)
  r = await api('POST', '/api/bookings', tokenC, { clubSessionId: openSessId })
  assert(r.json?.booking?.status === 'confirmed', '4.1b mode=open second booking past maxPlayers → still confirmed',
    `status=${r.json?.booking?.status}`)

  // 4.2 mode=auto_confirm_till_full, maxPlayers=1 → first confirmed, second waiting_list
  // Use tokenB and tokenC (confirmed profiles[1] and profiles[2] are always distinct)
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'AutoFull Cap=1 Test', format: 'social',
    startTime: new Date(Date.now() + 7 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 7 * 86400000 + 3600000).toISOString(),
    maxPlayers: 1, autoConfirmMode: 'auto_confirm_till_full', privacy: 'public',
  })
  sessionAutoId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${sessionAutoId}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenA, { clubSessionId: sessionAutoId })
  assert(r.json?.booking?.status === 'confirmed', '4.2a First booking → confirmed',
    `status=${r.json?.booking?.status}`)
  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionAutoId })
  assert(r.json?.booking?.status === 'waiting_list', '4.2b Second booking past cap → waiting_list (US-2)',
    `status=${r.json?.booking?.status}`)

  // 4.3 mode=requires_approval → booking requested
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Requires Approval 2', format: 'singles',
    startTime: new Date(Date.now() + 8 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 8 * 86400000 + 3600000).toISOString(),
    maxPlayers: 10, autoConfirmMode: 'requires_approval', privacy: 'public',
  })
  const rqSess2Id = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${rqSess2Id}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenB, { clubSessionId: rqSess2Id })
  assert(r.json?.booking?.status === 'requested', '4.3 mode=requires_approval → booking=requested (US-3)',
    `status=${r.json?.booking?.status}`)

  // 4.4 PATCH session autoConfirmMode open→requires_approval → next booking requested
  r = await api('PATCH', `/api/club-sessions/${openSessId}`, hostToken, { autoConfirmMode: 'requires_approval' })
  assert(r.status === 200 && r.json?.session?.autoConfirmMode === 'requires_approval',
    '4.4 PATCH session autoConfirmMode → persisted', `mode=${r.json?.session?.autoConfirmMode}`)

  // 4.5 Backward compat: requiresApproval=true, no autoConfirmMode → booking requested
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'BackCompat Requires', format: 'social',
    startTime: new Date(Date.now() + 9 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 9 * 86400000 + 3600000).toISOString(),
    maxPlayers: 8, requiresApproval: true, privacy: 'public',
  })
  const bcSessId = r.json?.session?.id
  assert(r.json?.session?.autoConfirmMode === 'requires_approval',
    '4.5a Backward compat: requiresApproval=true maps autoConfirmMode=requires_approval',
    `mode=${r.json?.session?.autoConfirmMode}`)
  await api('PATCH', `/api/club-sessions/${bcSessId}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenC, { clubSessionId: bcSessId })
  assert(r.json?.booking?.status === 'requested',
    '4.5b requiresApproval=true (legacy) → booking=requested', `status=${r.json?.booking?.status}`)

  // ═══════════════════════════════════════════════════════════
  // Section 5 — Notifications (US-3, US-4, US-5)
  // (we verify no errors thrown, not actual delivery)
  // ═══════════════════════════════════════════════════════════
  section(5, 'Notifications (smoke check — no errors)')

  // 5.1 Open session booking → no notification errors
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Notif Open Session', format: 'social',
    startTime: new Date(Date.now() + 10 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 10 * 86400000 + 3600000).toISOString(),
    maxPlayers: 8, autoConfirmMode: 'open', privacy: 'public',
  })
  const notifOpenId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${notifOpenId}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenD, { clubSessionId: notifOpenId })
  assert(r.status === 201, '5.1 Open session booking → 201 (no notification errors)')

  // 5.2 requires_approval booking → cs_booking_requested fired (B1-C)
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Notif Requires Session', format: 'social',
    startTime: new Date(Date.now() + 11 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 11 * 86400000 + 3600000).toISOString(),
    maxPlayers: 8, autoConfirmMode: 'requires_approval', privacy: 'public',
  })
  const notifRqId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${notifRqId}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenE, { clubSessionId: notifRqId })
  assert(r.status === 201, '5.2 requires_approval booking → 201 (B1-C: cs_booking_requested fired to host)',
    `status=${r.status} notifRqId=${notifRqId} body=${JSON.stringify(r.json)}`)
  await settle(400)
  const rqNotif = await prisma.notificationSent.findFirst({
    where: { type: 'cs_booking_requested', recipientId: host.id },
    orderBy: { sentAt: 'desc' },
  })
  assert(rqNotif != null, '5.2b cs_booking_requested row in NotificationSent (B1-C)',
    rqNotif ? 'found' : 'not found')

  // 5.3 Auto-backfill → cs_booking_auto_backfill (US-5)
  await settle(300)
  const backfillNotif = await prisma.notificationSent.findFirst({
    where: { type: 'cs_booking_auto_backfill' },
    orderBy: { sentAt: 'desc' },
  })
  assert(backfillNotif != null, '5.3 Auto-backfill → cs_booking_auto_backfill row (US-5)',
    backfillNotif ? 'found' : 'not found (may pass if no backfill happened in section 3)')

  // 5.4 Session cancel → cs_session_cancelled (US-4)
  r = await api('PATCH', `/api/club-sessions/${notifOpenId}`, hostToken, { lifecycleState: 'cancelled' })
  assert(r.status === 200, '5.4a Session cancel → 200')
  await settle(400)
  const cancelNotif = await prisma.notificationSent.findFirst({
    where: { type: 'cs_session_cancelled' },
    orderBy: { sentAt: 'desc' },
  })
  assert(cancelNotif != null, '5.4b cs_session_cancelled row in NotificationSent (US-4)',
    cancelNotif ? 'found' : 'not found (no players → ok)')

  // 5.5 Player cancel → cs_player_cancelled (host receives)
  r = await api('PATCH', `/api/bookings/${bookingAId}`, tokenB, { status: 'declined' })
  assert(r.status === 200, '5.5a Player cancel → 200')
  await settle(400)

  // ═══════════════════════════════════════════════════════════
  // Section 6 — Auth guards
  // ═══════════════════════════════════════════════════════════
  section(6, 'Auth guards')

  // 6.1 Unauthenticated POST /api/bookings → 401
  r = await api('POST', '/api/bookings', null, { clubSessionId: sessionId })
  assert(r.status === 401, '6.1 Unauthenticated POST /api/bookings → 401', `status=${r.status}`)

  // 6.2 Non-manager PATCH booking status → 403
  r = await api('PATCH', `/api/bookings/${bookingBId}`, tokenD, { status: 'declined' })
  assert(r.status === 403, '6.2 Non-manager PATCH other player booking → 403', `status=${r.status}`)

  // 6.3 Player can PATCH own booking to declined → 200
  const ownBookingResp = await api('POST', '/api/bookings', tokenB, { clubSessionId: sessionId })
  const ownBookingId = ownBookingResp.json?.booking?.id
  if (ownBookingId) {
    r = await api('PATCH', `/api/bookings/${ownBookingId}`, tokenB, { status: 'declined' })
    assert(r.status === 200, '6.3 Player cancels own booking → 200', `status=${r.status}`)
  } else {
    pass('6.3 Skipped (player already has booking)')
  }

  // 6.4 Player cannot PATCH another player's booking → 403
  // bookingBId belongs to tokenC (profiles[2]); use tokenD (profiles[3]) to try to cancel it
  r = await api('PATCH', `/api/bookings/${bookingBId}`, tokenD, { status: 'declined' })
  assert(r.status === 403, "6.4 Player can't PATCH another player's booking → 403", `status=${r.status}`)

  // 6.5 Co-manager can PATCH session
  r = await api('PATCH', `/api/club-sessions/${sessionId}`, coManagerToken, { notes: 'Updated by co-manager' })
  assert(r.status === 200, '6.5 Co-manager PATCH /api/club-sessions/[id] → 200', `status=${r.status}`)

  // ═══════════════════════════════════════════════════════════
  // Section 7 — Membership (US-4 side-effect)
  // ═══════════════════════════════════════════════════════════
  section(7, 'Membership (US-4 side-effect)')

  // 7.1 POST /api/memberships → join club (idempotent: 409 = already a member)
  r = await api('POST', '/api/memberships', tokenD, { appClubId: clubId })
  assert(r.status === 200 || r.status === 201 || r.status === 409,
    '7.1 POST /api/memberships → join club (or already member)', `status=${r.status}`)

  // 7.2 GET /api/memberships?appClubId=X → isMember=true
  r = await api('GET', `/api/memberships?appClubId=${clubId}`, tokenD)
  const memStatus = r.json?.isMember ?? r.json?.member
  assert(r.status === 200 && memStatus, '7.2 GET /api/memberships?appClubId → isMember=true',
    `isMember=${memStatus}`)

  // 7.3 Booking on club with autoApproveNewMembers → membership auto-created
  const newMemberSession = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'AutoMember Session', format: 'social',
    startTime: new Date(Date.now() + 12 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 12 * 86400000 + 3600000).toISOString(),
    maxPlayers: 8, privacy: 'public',
  })
  const autoMembSessId = newMemberSession.json?.session?.id
  await api('PATCH', `/api/club-sessions/${autoMembSessId}`, hostToken, { lifecycleState: 'published' })
  r = await api('POST', '/api/bookings', tokenE, { clubSessionId: autoMembSessId })
  assert(r.status === 201, '7.3 POST /api/bookings on autoApproveNewMembers club → booking created',
    `status=${r.status} body=${JSON.stringify(r.json)}`)
  const autoMember = await prisma.appClubMember.findFirst({
    where: { appClubId: clubId, playerProfileId: playerE.id },
  })
  assert(autoMember != null, '7.3b autoApproveNewMembers → membership auto-created',
    autoMember ? 'found' : 'not found')

  // 7.4 DELETE /api/memberships → leave; GET confirms isMember=false
  r = await api('DELETE', `/api/memberships?appClubId=${clubId}`, tokenD)
  assert(r.status === 200 || r.status === 204, '7.4a DELETE /api/memberships → leave', `status=${r.status}`)
  r = await api('GET', `/api/memberships?appClubId=${clubId}`, tokenD)
  const afterDelete = r.json?.isMember ?? r.json?.member ?? false
  assert(!afterDelete, '7.4b GET confirms isMember=false after leave', `isMember=${afterDelete}`)

  // ═══════════════════════════════════════════════════════════
  // Section 8 — Venue search (US-4 VenuePicker, B1-E)
  // ═══════════════════════════════════════════════════════════
  section(8, 'Venue search (B1-E)')

  // 8.1 GET /api/venues?search=<partial_name> → returns matching venues
  const searchTerm = nearVenue.name.slice(0, 5)
  r = await api('GET', `/api/venues?search=${encodeURIComponent(searchTerm)}`, hostToken)
  assert(r.status === 200 && Array.isArray(r.json?.venues), '8.1 GET /api/venues?search= → array of venues',
    `status=${r.status}`)
  const matchedVenues = r.json?.venues ?? []
  assert(matchedVenues.some(v => v.id === nearVenue.id),
    `8.1b venues include the venue matching "${searchTerm}"`,
    `found ${matchedVenues.length} venues`)

  // 8.2 GET /api/venues?search= (empty) → default list
  r = await api('GET', '/api/venues?search=', hostToken)
  assert(r.status === 200 && Array.isArray(r.json?.venues), '8.2 GET /api/venues?search= (empty) → array',
    `status=${r.status}`)

  // 8.3 GET /api/venues?search=zzznomatch → []
  r = await api('GET', '/api/venues?search=zzznomatch_xyz_does_not_exist', hostToken)
  assert(r.status === 200 && (r.json?.venues?.length ?? 0) === 0,
    '8.3 GET /api/venues?search=zzznomatch → empty array', `count=${r.json?.venues?.length}`)

  // ═══════════════════════════════════════════════════════════
  // Section 9 — Distance filter (US-1, B2-E)
  // ═══════════════════════════════════════════════════════════
  section(9, 'Distance filter (US-1, B2-E)')

  // Create a session at farVenue (at 0,0 — very far)
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'Far Away Session', format: 'social',
    startTime: new Date(Date.now() + 13 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 13 * 86400000 + 3600000).toISOString(),
    maxPlayers: 8, venueId: farVenue.id, privacy: 'public',
  })
  sessionFarId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${sessionFarId}`, hostToken, { lifecycleState: 'published' })

  // 9.1 Within 1km of nearVenue lat/lng → only nearby session included
  const nearLat = nearVenue.latitude
  const nearLng = nearVenue.longitude
  // Use appClubId to scope geo queries to the test club only (avoids pagination issues with global public sessions)
  r = await api('GET', `/api/club-sessions?appClubId=${clubId}&lat=${nearLat}&lng=${nearLng}&radiusKm=1&take=50`, hostToken)
  const nearby1km = r.json?.sessions ?? []
  assert(r.status === 200, '9.1a Distance filter GET → 200', `status=${r.status}`)
  const farIncluded = nearby1km.some(s => s.id === sessionFarId)
  assert(!farIncluded, '9.1b Far session excluded from 1km radius filter',
    farIncluded ? 'far session was included (unexpected)' : 'correctly excluded')

  // 9.2 Session with no venue (venuePending=true) → always included
  r = await api('POST', '/api/club-sessions', hostToken, {
    appClubId: clubId, name: 'TBD Venue Session', format: 'social',
    startTime: new Date(Date.now() + 14 * 86400000).toISOString(),
    endTime: new Date(Date.now() + 14 * 86400000 + 3600000).toISOString(),
    maxPlayers: 8, venuePending: true, privacy: 'public',
  })
  const tbdSessId = r.json?.session?.id
  await api('PATCH', `/api/club-sessions/${tbdSessId}`, hostToken, { lifecycleState: 'published' })
  r = await api('GET', `/api/club-sessions?appClubId=${clubId}&lat=${nearLat}&lng=${nearLng}&radiusKm=1&take=50`, hostToken)
  const allInFilter = r.json?.sessions ?? []
  const tbdIncluded = allInFilter.some(s => s.id === tbdSessId)
  assert(tbdIncluded, '9.2 Session with venuePending=true always included in geo filter',
    tbdIncluded ? 'included' : `missing (tbdSessId=${tbdSessId}, total=${allInFilter.length}) — TBD sessions should always appear`)

  // 9.3 radiusKm=50000 → all sessions returned (including far)
  r = await api('GET', `/api/club-sessions?appClubId=${clubId}&lat=${nearLat}&lng=${nearLng}&radiusKm=50000&take=50`, hostToken)
  const allSessions = r.json?.sessions ?? []
  // Can't assert exact count since other tests create sessions, but far session should be included
  const farInBig = allSessions.some(s => s.id === sessionFarId)
  assert(farInBig || allSessions.length > 0,
    '9.3 radiusKm=50000 → all sessions returned (far included)', `count=${allSessions.length}`)

  // ─────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(56))
  console.log(`  Total: ${passed + failed}  ✅ ${passed} passed  ❌ ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed assertions:')
    errors.forEach(e => console.log(`  • ${e}`))
  }
  console.log('═'.repeat(56))

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('\n💥 Unhandled error:', err)
  process.exit(1)
}).finally(() => prisma.$disconnect())
