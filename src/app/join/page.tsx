import type { Metadata } from "next";

const IOS_URL = "https://apps.apple.com/us/app/squadd-pickleball-community/id6775106332";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.squadd.thehub.app";

export const metadata: Metadata = {
  title: "Join SQUADD — Social Pickleball",
  description: "Track your games, follow your friends, and grow your pickleball Circle.",
  openGraph: {
    title: "Join SQUADD 🏓",
    description: "Social pickleball — follow friends, track sessions, earn kudos.",
  },
};

export default function JoinPage() {
  return (
    <div style={s.container}>
      <div style={s.card}>
        <p style={s.logo}>🏓</p>
        <h1 style={s.title}>Join SQUADD</h1>
        <p style={s.sub}>
          Follow friends, track sessions, earn kudos. Your pickleball Circle starts here.
        </p>

        <div style={s.badgeRow}>
          <a href={IOS_URL} style={s.badge}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
              alt="Download on the App Store"
              height={44}
            />
          </a>
          <a href={ANDROID_URL} style={s.badge}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              alt="Get it on Google Play"
              height={44}
            />
          </a>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a0a3a 0%, #0a0612 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: "24px 16px",
  },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(102,126,234,0.25)",
    borderRadius: 24,
    padding: "48px 32px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    color: "#fff",
  },
  logo: {
    fontSize: 56,
    margin: "0 0 8px",
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    margin: "0 0 12px",
    letterSpacing: 0.5,
  },
  sub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    lineHeight: 1.5,
    margin: "0 0 32px",
  },
  badgeRow: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
  },
  badge: {
    display: "inline-block",
  },
};
