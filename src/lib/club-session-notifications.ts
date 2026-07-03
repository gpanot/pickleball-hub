/**
 * Push notification helpers for Club Sessions.
 * All 7 notification types from spec §4.
 * Uses sendPushNotification + NotificationSent for logging, consistent with the
 * existing notification infrastructure.
 */
import { sendPushNotification } from "@/lib/notifications";
import { prisma } from "@/lib/db";

type ClubSessionNotifType =
  | "cs_booking_confirmed"        // rows 1 & 4: → confirmed (host-initiated)
  | "cs_booking_requested"        // player self-book on requires_approval session → notify host
  | "cs_booking_waiting_list"     // row 2: → waiting_list
  | "cs_booking_declined"         // row 3: → declined
  | "cs_booking_auto_backfill"    // row 5: auto-backfill → confirmed
  | "cs_session_cancelled"        // row 6: host cancels session
  | "cs_player_cancelled";        // row 7: confirmed player cancels → notify host

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

/** Player self-books on requires_approval session — notify host */
export async function notifyBookingRequested(opts: {
  playerProfileId: string;
  playerDisplayName: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  await logAndSend(opts.hostProfileId, opts.playerProfileId, "cs_booking_requested", {
    title: "New booking request",
    body: `${opts.playerDisplayName} requested to join ${opts.sessionName}`,
    data: { type: "cs_booking_requested", sessionId: opts.sessionId },
  });
}

/** Row 1 & 4: host moves booking to confirmed */
export async function notifyBookingConfirmed(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_confirmed", {
    title: "You're in! 🎾",
    body: `You're confirmed for ${opts.sessionName}`,
    data: { type: "cs_booking_confirmed", sessionId: opts.sessionId },
  });
}

/** Row 2: host moves booking to waiting_list */
export async function notifyBookingWaitingList(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_waiting_list", {
    title: "You're on the waiting list",
    body: `You're on the waiting list for ${opts.sessionName}`,
    data: { type: "cs_booking_waiting_list", sessionId: opts.sessionId },
  });
}

/** Row 3: host declines a booking */
export async function notifyBookingDeclined(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_declined", {
    title: "Request not approved",
    body: `Your request for ${opts.sessionName} wasn't approved`,
    data: { type: "cs_booking_declined", sessionId: opts.sessionId },
  });
}

/** Row 5: auto-backfill promotes longest-waiting player to confirmed */
export async function notifyAutoBackfill(opts: {
  playerProfileId: string;
  hostProfileId: string;
  sessionName: string;
  sessionId: string;
}) {
  await logAndSend(opts.playerProfileId, opts.hostProfileId, "cs_booking_auto_backfill", {
    title: "A spot opened up! 🎉",
    body: `A spot opened up — you're confirmed for ${opts.sessionName}`,
    data: { type: "cs_booking_auto_backfill", sessionId: opts.sessionId },
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
    select: { playerProfileId: true },
  });

  await Promise.all(
    bookings.map((b) =>
      logAndSend(b.playerProfileId, opts.hostProfileId, "cs_session_cancelled", {
        title: "Session cancelled",
        body: `${opts.sessionName} has been cancelled by the host`,
        data: { type: "cs_session_cancelled", sessionId: opts.sessionId },
      }),
    ),
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
  await logAndSend(opts.hostProfileId, opts.playerProfileId, "cs_player_cancelled", {
    title: "Spot freed up",
    body: `${opts.playerDisplayName} cancelled their spot for ${opts.sessionName}`,
    data: { type: "cs_player_cancelled", sessionId: opts.sessionId },
  });
}
