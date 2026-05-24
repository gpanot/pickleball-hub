import { getMessaging } from "@/lib/firebase-admin";
import { prisma } from "@/lib/db";

/**
 * Send a push notification via Firebase Admin SDK.
 *
 * Uses data-only messages (no top-level `notification` key) so that
 * Expo's ExpoFirebaseMessagingService handles presentation on Android.
 * Including a `notification` key would bypass the Expo JS layer entirely.
 */
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
}): Promise<{ success: boolean; error?: string; message?: string }> {
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
      // Data-only message — all values must be strings.
      // Expo's ExpoFirebaseMessagingService reads title/body/channelId/sound
      // from data and presents the notification through the JS layer.
      data: {
        title,
        message: body,
        body,
        channelId: "default",
        sound: "default",
        ...data,
      },
      android: { priority: "high" },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "content-available": 1,
          },
        },
        headers: { "apns-priority": "10" },
      },
    });
    console.log("Push notification sent, messageId:", messageId);
    return { success: true };
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string; errorInfo?: { code?: string; message?: string } };
    const code = firebaseErr.code ?? firebaseErr.errorInfo?.code ?? "unknown";
    const message = firebaseErr.message ?? firebaseErr.errorInfo?.message ?? "no message";
    console.error("[push] FCM send failed — code:", code, "| message:", message);
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      await prisma.playerProfile.updateMany({
        where: { pushToken: token },
        data: { pushToken: null },
      });
    }
    return { success: false, error: code, message };
  }
}
