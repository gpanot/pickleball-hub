import { messaging } from "@/lib/firebase-admin";
import { prisma } from "@/lib/db";

export async function sendPushNotification({
  token,
  title,
  body,
  data = {},
}: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  try {
    await messaging.send({
      token,
      notification: { title, body },
      data,
      android: {
        notification: {
          color: "#f5a623",
          priority: "high",
          channelId: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string };
    console.error("Push notification failed:", err);
    if (firebaseErr.code === "messaging/registration-token-not-registered") {
      await prisma.playerProfile.updateMany({
        where: { pushToken: token },
        data: { pushToken: null },
      });
    }
  }
}
