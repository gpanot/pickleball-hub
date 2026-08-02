import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { reclubAvatarUrl } from "@/lib/utils";

const IOS_URL = "https://apps.apple.com/us/app/squadd-pickleball-community/id6775106332";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.squadd.thehub.app";

type Props = { params: Promise<{ profileId: string }> };

async function fetchProfile(profileId: string) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(profileId)) return null;

  const profile = await prisma.playerProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      displayName: true,
      reclubUserId: true,
      user: { select: { image: true } },
      reclubPlayer: { select: { imageUrl: true, displayName: true } },
      _count: { select: { following: true } },
    },
  });
  if (!profile) return null;

  return {
    id: profile.id,
    nickname: profile.displayName ?? profile.reclubPlayer?.displayName ?? "Player",
    avatarUrl:
      profile.user?.image ??
      profile.reclubPlayer?.imageUrl ??
      (profile.reclubUserId ? reclubAvatarUrl(profile.reclubUserId) : null),
    followingCount: profile._count.following,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profileId } = await params;
  const profile = await fetchProfile(profileId);

  if (!profile) {
    return { title: "Player not found — SQUADD" };
  }

  const title = `${profile.nickname}'s Circle — SQUADD`;
  const description = `${profile.nickname} has ${profile.followingCount} friends in their Circle. Join them on SQUADD 🏓`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: profile.avatarUrl
        ? [{ url: profile.avatarUrl, width: 200, height: 200 }]
        : [],
    },
  };
}

export default async function PlayerPublicPage({ params }: Props) {
  const { profileId } = await params;
  const profile = await fetchProfile(profileId);

  const deepLink = `squadd://u/${profileId}`;

  if (!profile) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h1 style={s.title}>Player not found</h1>
          <p style={s.sub}>This link may be expired or invalid.</p>
          <a href={IOS_URL} style={s.badge}>Download SQUADD</a>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* Open in app redirect script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('DOMContentLoaded', function(){
              var tried = false;
              function tryDeepLink(e){
                if(tried) return; tried = true;
                e.preventDefault();
                window.location.href = '${deepLink}';
              }
              var btn = document.getElementById('open-btn');
              if(btn) btn.addEventListener('click', tryDeepLink);
            });
          `,
        }}
      />

      <div style={s.card}>
        {profile.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt={profile.nickname} style={s.avatar} />
        )}
        <h1 style={s.name}>{profile.nickname}</h1>
        <p style={s.circleCount}>
          <span style={s.countNum}>{profile.followingCount}</span>{" "}
          friends in their Circle
        </p>

        <a id="open-btn" href={deepLink} style={s.ctaPrimary}>
          Open in SQUADD
        </a>

        <p style={s.orText}>— or download —</p>

        <div style={s.badgeRow}>
          <a href={IOS_URL} style={s.badge}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
              alt="Download on the App Store"
              height={40}
            />
          </a>
          <a href={ANDROID_URL} style={s.badge}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              alt="Get it on Google Play"
              height={40}
            />
          </a>
        </div>

        <p style={s.hint}>
          Already have the app? Tap &quot;Open in SQUADD&quot; above.
        </p>
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
    padding: "40px 32px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    color: "#fff",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid #667EEA",
    marginBottom: 16,
  },
  name: {
    fontSize: 28,
    fontWeight: 800,
    margin: "0 0 8px",
    letterSpacing: 0.5,
  },
  circleCount: {
    fontSize: 16,
    color: "rgba(255,255,255,0.65)",
    margin: "0 0 28px",
  },
  countNum: {
    color: "#667EEA",
    fontWeight: 700,
  },
  ctaPrimary: {
    display: "block",
    background: "linear-gradient(135deg, #667EEA 0%, #764BA2 100%)",
    color: "#fff",
    textDecoration: "none",
    borderRadius: 14,
    padding: "16px 24px",
    fontWeight: 700,
    fontSize: 17,
    marginBottom: 16,
    borderBottom: "3px solid #3d2470",
  },
  orText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    margin: "0 0 16px",
  },
  badgeRow: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: 20,
  },
  badge: {
    display: "inline-block",
  },
  sub: {
    color: "rgba(255,255,255,0.55)",
    margin: "8px 0 24px",
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    margin: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 8px",
  },
};
