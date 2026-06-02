import { getMessaging } from "@/lib/firebase-admin";
import { prisma } from "@/lib/db";

type PushResult = { success: boolean; error?: string; message?: string };

/**
 * Send a push notification to a single FCM/APNs token.
 */
export async function sendToToken(
  token: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<PushResult> {
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
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        title: payload.title,
        message: payload.body,
        body: payload.body,
        sound: "default",
        ...(payload.data ?? {}),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "default",
          sound: "default",
          priority: "max",
        },
      },
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
    console.error("[push] FCM send failed — code:", code, "| message:", message, "| token prefix:", token.slice(0, 20));
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument"
    ) {
      console.warn("[push] Clearing invalid token from DB — prefix:", token.slice(0, 20));
      await prisma.playerProfile.updateMany({
        where: { pushToken: token },
        data: { pushToken: null },
      });
      await prisma.playerProfile.updateMany({
        where: { pushTokenIos: token },
        data: { pushTokenIos: null },
      });
    }
    return { success: false, error: code, message };
  }
}

/**
 * Send a push notification to all registered devices for a profile.
 * Looks up both pushToken (Android) and pushTokenIos from the profile.
 */
export async function sendPushNotification(
  profileId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<PushResult> {
  const profile = await prisma.playerProfile.findUnique({
    where: { id: profileId },
    select: { pushToken: true, pushTokenIos: true },
  });

  const tokens = [profile?.pushToken, profile?.pushTokenIos].filter(
    Boolean,
  ) as string[];

  if (tokens.length === 0) {
    return { success: false, error: "no_token" };
  }

  const results = await Promise.all(
    tokens.map(async (t) => {
      const label = t === profile?.pushTokenIos ? "iOS" : "Android";
      console.log(`[push] Sending to ${label} token — prefix:`, t.slice(0, 20));
      const r = await sendToToken(t, payload);
      console.log(`[push] ${label} result:`, r.success ? "✅ success" : `❌ ${r.error}: ${r.message}`);
      return r;
    }),
  );

  return results.some((r) => r.success)
    ? { success: true }
    : results[0];
}
