import { NextRequest } from "next/server";
import { getPostHogClient } from "@/lib/posthog-server";

const IOS_URL =
  "https://apps.apple.com/us/app/squadd-pickleball-community/id6775106332";
const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.squadd.thehub.app";
const FALLBACK_URL = "https://hub.thecourtflow.com";

/** Append ?squadd_code= to a store URL (ignored by stores, used for deferred deep link). */
function appendCode(url: string, code: string | null): string {
  if (!code) return url;
  return `${url}${url.includes("?") ? "&" : "?"}squadd_code=${code}`;
}

export async function GET(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const code = request.nextUrl.searchParams.get("code");

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const platform = isIOS ? "ios" : isAndroid ? "android" : "desktop";

  // Fire analytics — best-effort, non-blocking
  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: code ?? "anonymous",
      event: "download_redirect",
      properties: {
        platform,
        squad_code: code ?? null,
        user_agent: ua,
      },
    });
    // flush is synchronous in edge/serverless; ignore errors
    await posthog.shutdown().catch(() => {});
  } catch {}

  if (isIOS) {
    return Response.redirect(appendCode(IOS_URL, code), 302);
  }
  if (isAndroid) {
    return Response.redirect(appendCode(ANDROID_URL, code), 302);
  }

  // Desktop / unknown — send to join preview if a code is present, else home
  if (code) {
    return Response.redirect(
      `https://hub.thecourtflow.com/join/${code}`,
      302
    );
  }
  return Response.redirect(FALLBACK_URL, 302);
}
