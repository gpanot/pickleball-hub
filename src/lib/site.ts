/** Canonical public site origin (OG URLs, share links). Override with NEXT_PUBLIC_SITE_URL in env. */
export const HUB_SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://pickleball-hub-gules.vercel.app"
).replace(/\/$/, "");
