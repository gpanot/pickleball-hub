/**
 * Push notification helpers for Club Sessions.
 * All 7 notification types from spec §4.
 * Uses sendPushNotification + NotificationSent for logging, consistent with the
 * existing notification infrastructure.
 */
import { sendPushNotification } from "@/lib/notifications";
import { prisma } from "@/lib/db";
import { pushCopy, getLangFromPrefs } from "@/lib/push-locale";

type ClubSessionNotifType =
  | "cs_booking_confirmed"        // rows 1 & 4: → confirmed (host-initiated)
  | "cs_booking_requested"        // player self-book on requires_approval session → notify host
  | "cs_booking_waiting_list"     // row 2: → waiting_list
  | "cs_booking_declined"         // row 3: → declined
  | "cs_booking_auto_backfill"    // row 5: auto-backfill → confirmed
  | "cs_session_cancelled"        // row 6: host cancels session
  | "cs_player_cancelled"         // row 7: confirmed player cancels → notify host
  | "cs_manager_added"            // manager added to club
  | "cs_manager_removed"          // manager removed from club
  | "cs_sessions_reassigned"      // owner summary when removed manager had live sessions
  | "cs_ownership_transferred_to" // new owner notification
  | "cs_ownership_transferred_from"; // former owner notification

async function logAndSend(
  recipientId: string,
  senderId: string,
  type: ClubSessionNotifType,
  payload: { title: string; body: string; data?: Record<string, string> },
) {
  // Fire-and-forget: don't block the state transition on delivery success
  void sendPushNotification(recipientId, payload);
  await prisma.notificationSent.create({
    data: { recipientId, senderId, type },
  });
}

/** Fetch the push-language preference for a player profile. Defaults to "en". */
async function recipientLang(profileId: string) {
  const profile = await prisma.playerProfile.findUnique({
    where: { id: profileId },
    select: { preferences: true },
  });
  return getLangFromPrefs(profile?.preferences);
}

/** Player self-books on requires_approval session — notify host */
export async function notifyBookingRequested(opts: {
  playerProfileId: string;
  playerDisplayName: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  const lang = await recipientLang(opts.hostProfileId);
  const { title, body } = pushCopy[lang].bookingRequested(opts.playerDisplayName, opts.sessionName);
  await logAndSend(opts.hostProfileId, opts.playerProfileId, "cs_booking_requested", {
    title, body, data: { type: "cs_booking_requested", sessionId: opts.sessionId },
  });
}

/** Row 1 & 4: host moves booking to confirmed */
export async function notifyBookingConfirmed(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  const lang = await recipientLang(opts.playerProfileId);
  const { title, body } = pushCopy[lang].bookingConfirmed(opts.sessionName);
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_confirmed", {
    title, body, data: { type: "cs_booking_confirmed", sessionId: opts.sessionId },
  });
}

/** Row 2: host moves booking to waiting_list */
export async function notifyBookingWaitingList(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  const lang = await recipientLang(opts.playerProfileId);
  const { title, body } = pushCopy[lang].bookingWaitingList(opts.sessionName);
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_waiting_list", {
    title, body, data: { type: "cs_booking_waiting_list", sessionId: opts.sessionId },
  });
}

/** Row 3: host declines a booking */
export async function notifyBookingDeclined(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  const lang = await recipientLang(opts.playerProfileId);
  const { title, body } = pushCopy[lang].bookingDeclined(opts.sessionName);
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_declined", {
    title, body, data: { type: "cs_booking_declined", sessionId: opts.sessionId },
  });
}

/** Row 5: auto-backfill promotes longest-waiting player to confirmed */
export async function notifyAutoBackfill(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  const lang = await recipientLang(opts.playerProfileId);
  const { title, body } = pushCopy[lang].autoBackfill(opts.sessionName);
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_auto_backfill", {
    title, body, data: { type: "cs_booking_auto_backfill", sessionId: opts.sessionId },
  });
}

/** Row 6: host cancels session — notify all confirmed + waiting_list players */
export async function notifySessionCancelled(opts: {
  sessionId: string;
  sessionName: string;
  hostProfileId: string;
}) {
  const bookings = await prisma.clubSessionBooking.findMany({
    where: {
      clubSessionId: opts.sessionId,
      status: { in: ["confirmed", "waiting_list"] },
    },
    select: {
      playerProfileId: true,
      player: { select: { preferences: true } },
    },
  });

  await Promise.all(
    bookings.map((b) => {
      const lang = getLangFromPrefs(b.player.preferences);
      const { title, body } = pushCopy[lang].sessionCancelled(opts.sessionName);
      return logAndSend(b.playerProfileId, opts.hostProfileId, "cs_session_cancelled", {
        title, body, data: { type: "cs_session_cancelled", sessionId: opts.sessionId },
      });
    }),
  );
}

/** Row 7: a confirmed player cancels their own spot — notify host */
export async function notifyPlayerCancelledToHost(opts: {
  playerProfileId: string;
  hostProfileId: string;
  playerDisplayName: string;
  sessionName: string;
  sessionId: string;
}) {
  const lang = await recipientLang(opts.hostProfileId);
  const { title, body } = pushCopy[lang].playerCancelled(opts.playerDisplayName, opts.sessionName);
  await logAndSend(opts.hostProfileId, opts.playerProfileId, "cs_player_cancelled", {
    title, body, data: { type: "cs_player_cancelled", sessionId: opts.sessionId },
  });
}

// ── Manager role notifications ────────────────────────────────────────────────

/** A player was added as Admin or Host Manager — notify the added player. */
export async function notifyManagerAdded(opts: {
  addedProfileId: string;
  addedByProfileId: string;
  clubId: string;
  clubName: string;
  roleLabel: string;
}) {
  const lang = await recipientLang(opts.addedProfileId);
  const { title, body } = pushCopy[lang].managerAdded(opts.clubName, opts.roleLabel);
  await logAndSend(opts.addedProfileId, opts.addedByProfileId, "cs_manager_added", {
    title, body, data: { type: "cs_manager_added", clubId: opts.clubId },
  });
}

/** A manager was removed from the club — notify the removed player. */
export async function notifyManagerRemoved(opts: {
  removedProfileId: string;
  removedByProfileId: string;
  clubId: string;
  clubName: string;
}) {
  const lang = await recipientLang(opts.removedProfileId);
  const { title, body } = pushCopy[lang].managerRemoved(opts.clubName);
  await logAndSend(opts.removedProfileId, opts.removedByProfileId, "cs_manager_removed", {
    title, body, data: { type: "cs_manager_removed", clubId: opts.clubId },
  });
}

/** Removed manager had upcoming sessions reassigned to Owner — notify Owner. */
export async function notifySessionsReassigned(opts: {
  ownerProfileId: string;
  removedByProfileId: string;
  removedNickname: string;
  clubId: string;
  sessionCount: number;
}) {
  if (opts.sessionCount === 0) return;
  const lang = await recipientLang(opts.ownerProfileId);
  const { title, body } = pushCopy[lang].sessionsReassigned(opts.removedNickname, opts.sessionCount);
  await logAndSend(opts.ownerProfileId, opts.removedByProfileId, "cs_sessions_reassigned", {
    title, body, data: { type: "cs_sessions_reassigned", clubId: opts.clubId },
  });
}

/** Ownership was transferred — notify the new Owner. */
export async function notifyOwnershipTransferredToYou(opts: {
  newOwnerProfileId: string;
  formerOwnerProfileId: string;
  clubId: string;
  clubName: string;
}) {
  const lang = await recipientLang(opts.newOwnerProfileId);
  const { title, body } = pushCopy[lang].ownershipTransferredToYou(opts.clubName);
  await logAndSend(opts.newOwnerProfileId, opts.formerOwnerProfileId, "cs_ownership_transferred_to", {
    title, body, data: { type: "cs_ownership_transferred_to", clubId: opts.clubId },
  });
}

/** Ownership was transferred — notify the former Owner (now Admin). */
export async function notifyOwnershipTransferredAway(opts: {
  formerOwnerProfileId: string;
  newOwnerProfileId: string;
  clubId: string;
  clubName: string;
}) {
  const lang = await recipientLang(opts.formerOwnerProfileId);
  const { title, body } = pushCopy[lang].ownershipTransferredAway(opts.clubName);
  await logAndSend(opts.formerOwnerProfileId, opts.newOwnerProfileId, "cs_ownership_transferred_from", {
    title, body, data: { type: "cs_ownership_transferred_from", clubId: opts.clubId },
  });
}
