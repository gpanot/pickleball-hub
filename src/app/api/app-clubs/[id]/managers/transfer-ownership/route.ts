import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { can } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";
import { ClubRole } from "@prisma/client";
import {
  notifyOwnershipTransferredToYou,
  notifyOwnershipTransferredAway,
} from "@/lib/club-session-notifications";

// POST /api/app-clubs/[id]/managers/transfer-ownership
// Auth: Owner only (TRANSFER_OWNERSHIP permission)
// Body: { toProfileId }  — must be an existing Admin or Host Manager in this club
//
// Atomically in one transaction:
//   1. Set target's role → OWNER
//   2. Set current Owner's role → ADMIN
//   3. Update AppClub.creatorId → toProfileId
//
// Pushes: new Owner + former Owner (fire-and-forget)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authorized = await can(user.profileId, id, "TRANSFER_OWNERSHIP");
  if (!authorized) {
    return NextResponse.json(
      { error: "Only the club Owner can transfer ownership" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { toProfileId } = body as { toProfileId?: unknown };
  if (!toProfileId || typeof toProfileId !== "string") {
    return NextResponse.json({ error: "toProfileId required" }, { status: 400 });
  }

  if (toProfileId === user.profileId) {
    return NextResponse.json(
      { error: "Cannot transfer ownership to yourself" },
      { status: 400 },
    );
  }

  // Fetch target manager row — must be an existing ADMIN or HOST_MANAGER
  const targetRow = await prisma.appClubManager.findFirst({
    where: { appClubId: id, playerProfileId: toProfileId },
    select: { id: true, role: true },
  });
  if (!targetRow) {
    return NextResponse.json(
      { error: "Target player is not a manager of this club" },
      { status: 422 },
    );
  }
  if (targetRow.role === ClubRole.OWNER) {
    return NextResponse.json(
      { error: "Target is already the Owner" },
      { status: 409 },
    );
  }

  // Fetch current Owner's manager row
  const ownerRow = await prisma.appClubManager.findFirst({
    where: { appClubId: id, playerProfileId: user.profileId, role: ClubRole.OWNER },
    select: { id: true },
  });
  if (!ownerRow) {
    return NextResponse.json({ error: "Owner record not found" }, { status: 500 });
  }

  const club = await prisma.appClub.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  try {
    // IMPORTANT: Demote the current Owner FIRST, then promote the new Owner.
    // Reversing this order would temporarily create two OWNER rows for the same club,
    // violating the partial unique index `one_owner_per_club`. PostgreSQL checks
    // constraints immediately after each statement within a transaction.
    await prisma.$transaction([
      // Step 1: Former Owner → Admin (removes the only OWNER row)
      prisma.appClubManager.update({
        where: { id: ownerRow.id },
        data: { role: ClubRole.ADMIN },
      }),
      // Step 2: Target → Owner (adds a new OWNER row — now exactly one OWNER)
      prisma.appClubManager.update({
        where: { id: targetRow.id },
        data: { role: ClubRole.OWNER },
      }),
      // Step 3: Update AppClub.creatorId to reflect the new Owner
      prisma.appClub.update({
        where: { id },
        data: { creatorId: toProfileId },
      }),
    ]);
  } catch (err) {
    console.error("[POST /api/app-clubs/[id]/managers/transfer-ownership]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Push notifications (fire-and-forget)
  void notifyOwnershipTransferredToYou({
    newOwnerProfileId: toProfileId,
    formerOwnerProfileId: user.profileId,
    clubId: id,
    clubName: club.name,
  });
  void notifyOwnershipTransferredAway({
    formerOwnerProfileId: user.profileId,
    newOwnerProfileId: toProfileId,
    clubId: id,
    clubName: club.name,
  });

  return NextResponse.json({ ok: true });
}
