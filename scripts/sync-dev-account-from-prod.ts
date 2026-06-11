/**
 * Sync a production mobile user (default: giompanot@gmail.com) into the local DB
 * so dev sign-in shows the same Reclub link, follows, and profile.
 *
 * Usage (from pickleball-hub/):
 *   npx tsx scripts/sync-dev-account-from-prod.ts
 *   npx tsx scripts/sync-dev-account-from-prod.ts other@email.com
 *
 * Requires:
 *   .env.production  — prod DATABASE_URL
 *   .env.local       — local DATABASE_URL
 */

import { PrismaClient, type Player, type Follow } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

function readEnvFile(file: string): Record<string, string> {
  const full = path.join(process.cwd(), file)
  if (!fs.existsSync(full)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const email = process.argv[2]?.trim() || 'giompanot@gmail.com'
const prodUrl = readEnvFile('.env.production').DATABASE_URL
const localUrl = readEnvFile('.env.local').DATABASE_URL

if (!prodUrl) throw new Error('Missing DATABASE_URL in .env.production')
if (!localUrl) throw new Error('Missing DATABASE_URL in .env.local')

const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } })
const local = new PrismaClient({ datasources: { db: { url: localUrl } } })

function pickPlayer(row: Player) {
  return {
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    duprSingles: row.duprSingles,
    duprDoubles: row.duprDoubles,
    duprSinglesReliability: row.duprSinglesReliability,
    duprDoublesReliability: row.duprDoublesReliability,
    duprId: row.duprId,
    duprUpdatedAt: row.duprUpdatedAt,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function syncSessionGraph(
  prodDb: PrismaClient,
  localDb: PrismaClient,
  reclubUserId: bigint,
  followeeIds: bigint[],
) {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const mySessionIds = [
    ...new Set(
      (
        await prodDb.sessionRoster.findMany({
          where: { userId: reclubUserId },
          select: { sessionId: true },
        })
      ).map((r) => r.sessionId),
    ),
  ]

  const followeeSessionIds = [
    ...new Set(
      (
        await prodDb.sessionRoster.findMany({
          where: {
            userId: { in: followeeIds },
            session: { scrapedDate: { gte: fiveDaysAgo } },
          },
          select: { sessionId: true },
        })
      ).map((r) => r.sessionId),
    ),
  ]

  const sessionIds = [...new Set([...mySessionIds, ...followeeSessionIds])]
  if (sessionIds.length === 0) {
    console.log('  sessions: 0 (nothing to sync)')
    return
  }

  const sessions = await prodDb.session.findMany({
    where: { id: { in: sessionIds } },
    include: { club: true, venue: true },
  })

  const clubIds = [...new Set(sessions.map((s) => s.clubId))]
  const clubs = await prodDb.club.findMany({ where: { id: { in: clubIds } } })
  for (const club of clubs) {
    await localDb.club.upsert({
      where: { id: club.id },
      create: {
        id: club.id,
        reclubId: club.reclubId,
        name: club.name,
        slug: club.slug,
        sportId: club.sportId,
        communityId: club.communityId,
        market: club.market,
        numMembers: club.numMembers,
        zaloUrl: club.zaloUrl,
        phone: club.phone,
        admins: club.admins,
        createdAt: club.createdAt,
        updatedAt: club.updatedAt,
      },
      update: {
        name: club.name,
        slug: club.slug,
        market: club.market,
        numMembers: club.numMembers,
        updatedAt: club.updatedAt,
      },
    })
  }

  const venueIds = [
    ...new Set(sessions.map((s) => s.venueId).filter((id): id is number => id != null)),
  ]
  if (venueIds.length > 0) {
    const venues = await prodDb.venue.findMany({ where: { id: { in: venueIds } } })
    for (const venue of venues) {
      await localDb.venue.upsert({
        where: { id: venue.id },
        create: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          latitude: venue.latitude,
          longitude: venue.longitude,
          createdAt: venue.createdAt,
          updatedAt: venue.updatedAt,
        },
        update: {
          name: venue.name,
          address: venue.address,
          latitude: venue.latitude,
          longitude: venue.longitude,
          updatedAt: venue.updatedAt,
        },
      })
    }
    console.log(`  venues: ${venues.length}`)
  }

  for (const session of sessions) {
    await localDb.session.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        referenceCode: session.referenceCode,
        name: session.name,
        clubId: session.clubId,
        venueId: session.venueId,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMin: session.durationMin,
        maxPlayers: session.maxPlayers,
        feeAmount: session.feeAmount,
        feeCurrency: session.feeCurrency,
        costPerHour: session.costPerHour,
        privacy: session.privacy,
        status: session.status,
        skillLevelMin: session.skillLevelMin,
        skillLevelMax: session.skillLevelMax,
        perks: session.perks,
        description: session.description,
        eventUrl: session.eventUrl,
        scrapedDate: session.scrapedDate,
      },
      update: {
        name: session.name,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        scrapedDate: session.scrapedDate,
      },
    })
  }
  console.log(`  clubs: ${clubs.length}`)
  console.log(`  sessions: ${sessions.length}`)

  const rosters = await prodDb.sessionRoster.findMany({
    where: { sessionId: { in: sessionIds } },
  })

  const rosterPlayerIds = [...new Set(rosters.map((r) => r.userId))]
  const rosterPlayers = await prodDb.player.findMany({
    where: { userId: { in: rosterPlayerIds } },
  })
  for (const p of rosterPlayers) {
    await upsertPlayer(localDb, p)
  }
  console.log(`  roster players: ${rosterPlayers.length}`)

  let rosterCount = 0
  for (const roster of rosters) {
    await localDb.sessionRoster.upsert({
      where: {
        sessionId_userId: {
          sessionId: roster.sessionId,
          userId: roster.userId,
        },
      },
      create: {
        id: roster.id,
        sessionId: roster.sessionId,
        userId: roster.userId,
        isHost: roster.isHost,
        isConfirmed: roster.isConfirmed,
        scrapedAt: roster.scrapedAt,
        firstSeenAt: roster.firstSeenAt,
      },
      update: {
        isHost: roster.isHost,
        isConfirmed: roster.isConfirmed,
        scrapedAt: roster.scrapedAt,
        firstSeenAt: roster.firstSeenAt,
      },
    })
    rosterCount++
  }
  console.log(`  rosters: ${rosterCount}`)
}

async function upsertPlayer(db: PrismaClient, row: Player) {
  const data = pickPlayer(row)
  await db.player.upsert({
    where: { userId: row.userId },
    create: data,
    update: {
      username: data.username,
      displayName: data.displayName,
      imageUrl: data.imageUrl,
      duprSingles: data.duprSingles,
      duprDoubles: data.duprDoubles,
      duprSinglesReliability: data.duprSinglesReliability,
      duprDoublesReliability: data.duprDoublesReliability,
      duprId: data.duprId,
      duprUpdatedAt: data.duprUpdatedAt,
      lastSeenAt: data.lastSeenAt,
      updatedAt: data.updatedAt,
    },
  })
}

async function main() {
  console.log(`Syncing ${email} from prod → local…`)

  const prodUser = await prod.user.findUnique({ where: { email } })
  if (!prodUser) throw new Error(`No prod user for ${email}`)

  const prodProfile = await prod.playerProfile.findUnique({ where: { userId: prodUser.id } })
  if (!prodProfile) throw new Error(`No prod profile for ${email}`)

  const prodFollows: (Follow & { followee: Player })[] = await prod.follow.findMany({
    where: { followerId: prodProfile.id },
    include: { followee: true },
  })

  const playerIds = new Set<bigint>()
  if (prodProfile.reclubUserId) playerIds.add(prodProfile.reclubUserId)
  for (const f of prodFollows) playerIds.add(f.followeeId)

  const prodPlayers = await prod.player.findMany({
    where: { userId: { in: [...playerIds] } },
  })

  // Upsert players first (profile.reclubUserId FK + follows FK)
  for (const p of prodPlayers) {
    await upsertPlayer(local, p)
  }
  console.log(`  players: ${prodPlayers.length}`)

  // Upsert user by email (keep prod id so JWTs / references stay stable if copied)
  const localUser = await local.user.upsert({
    where: { email },
    create: {
      id: prodUser.id,
      email: prodUser.email,
      name: prodUser.name,
      image: prodUser.image,
      emailVerified: prodUser.emailVerified,
    },
    update: {
      name: prodUser.name,
      image: prodUser.image,
      emailVerified: prodUser.emailVerified,
    },
  })

  const localProfile = await local.playerProfile.upsert({
    where: { userId: localUser.id },
    create: {
      id: prodProfile.id,
      userId: localUser.id,
      reclubUserId: prodProfile.reclubUserId,
      displayName: prodProfile.displayName,
      gender: prodProfile.gender,
      preferences: prodProfile.preferences ?? {},
      onboardingCompleted: prodProfile.onboardingCompleted,
    },
    update: {
      reclubUserId: prodProfile.reclubUserId,
      displayName: prodProfile.displayName,
      gender: prodProfile.gender,
      preferences: prodProfile.preferences ?? {},
      onboardingCompleted: prodProfile.onboardingCompleted,
    },
  })

  let followCount = 0
  for (const f of prodFollows) {
    await local.follow.upsert({
      where: {
        followerId_followeeId: {
          followerId: localProfile.id,
          followeeId: f.followeeId,
        },
      },
      create: {
        followerId: localProfile.id,
        followeeId: f.followeeId,
        createdAt: f.createdAt,
      },
      update: {},
    })
    followCount++
  }

  console.log(`  user: ${localUser.id}`)
  console.log(`  profile: ${localProfile.id}`)
  console.log(`  reclubUserId: ${localProfile.reclubUserId?.toString() ?? 'none'}`)
  console.log(`  follows: ${followCount}`)

  if (prodProfile.reclubUserId) {
    console.log('Syncing sessions + rosters (feed + crossed paths)…')
    await syncSessionGraph(
      prod,
      local,
      prodProfile.reclubUserId,
      prodFollows.map((f) => f.followeeId),
    )
  }

  console.log('Done. Set DEV_IMPERSONATE_EMAIL in .env.local and restart npm run dev.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prod.$disconnect()
    await local.$disconnect()
  })
