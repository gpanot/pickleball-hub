import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

interface ConquestNotification {
  squadId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, string | number | boolean | null>;
  pushData?: Record<string, string>;
}

function toJsonValue(
  payload: Record<string, string | number | boolean | null> | undefined
): Prisma.InputJsonValue | undefined {
  if (!payload) return undefined;
  return payload as unknown as Prisma.InputJsonValue;
}

/**
 * Send a conquest push notification + write SquadAlert for all active members of a squad.
 */
export async function notifySquadMembers(
  notification: ConquestNotification
): Promise<void> {
  const members = await prisma.squadMember.findMany({
    where: { squadId: notification.squadId, leftAt: null },
    select: { profileId: true },
  });

  const jsonPayload = toJsonValue(notification.payload);

  const alertRows = members.map((m) => ({
    squadId: notification.squadId,
    recipientProfileId: m.profileId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    ...(jsonPayload !== undefined ? { payload: jsonPayload } : {}),
  }));

  await prisma.squadAlert.createMany({ data: alertRows });

  for (const member of members) {
    sendPushNotification(member.profileId, {
      title: notification.title,
      body: notification.body,
      data: {
        screen: "SquadAlerts",
        type: notification.type,
        ...(notification.pushData ?? {}),
      },
    }).catch((e) => console.error("[conquest-push] error:", e));
  }
}

/**
 * Send a conquest push notification + write SquadAlert for a single profile.
 */
export async function notifyProfile(
  profileId: string,
  notification: ConquestNotification
): Promise<void> {
  const jsonPayload = toJsonValue(notification.payload);

  await prisma.squadAlert.create({
    data: {
      squadId: notification.squadId,
      recipientProfileId: profileId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      ...(jsonPayload !== undefined ? { payload: jsonPayload } : {}),
    },
  });

  sendPushNotification(profileId, {
    title: notification.title,
    body: notification.body,
    data: {
      screen: "SquadAlerts",
      type: notification.type,
      ...(notification.pushData ?? {}),
    },
  }).catch((e) => console.error("[conquest-push] error:", e));
}
