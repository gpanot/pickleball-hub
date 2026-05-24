import { getMessaging } from "@/lib/firebase-admin";
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
}): Promise<{ success: boolean; error?: string }> {
  if (token.startsWith("ExponentPushToken")) {
    console.error(
      "Push notification failed: received Expo push token instead of native FCM token.",
      "Token prefix:", token.slice(0, 30)
    );
    return { success: false, error: "expo_token_format" };
  }

  try {
    const messageId = await getMessaging().send({
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
    console.log("Push notification sent, messageId:", messageId);
    return { success: true };
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    console.error("Push notification failed:", firebaseErr.code, firebaseErr.message);
    if (firebaseErr.code === "messaging/registration-token-not-registered") {
      await prisma.playerProfile.updateMany({
        where: { pushToken: token },
        data: { pushToken: null },
      });
    }
    return { success: false, error: firebaseErr.code ?? "unknown" };
  }
}
