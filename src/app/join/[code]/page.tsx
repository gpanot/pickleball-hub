import { prisma } from "@/lib/db";
import type { Metadata } from "next";

type Props = { params: Promise<{ code: string }> };

async function fetchSquadByCode(code: string) {
  const squadCode = await prisma.squadCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      squad: {
        include: {
          members: { where: { leftAt: null } },
        },
      },
    },
  });
  if (!squadCode || squadCode.squad.disbandedAt) return null;
  return squadCode.squad;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const squad = await fetchSquadByCode(code);
  if (!squad) {
    return { title: "Squad not found — SQUADD" };
  }

  return {
    title: `Join ${squad.name} on SQUADD`,
    description: `${squad.emoji} ${squad.name} · ${squad.members.length}/8 members · Join free on SQUADD`,
    openGraph: {
      title: `${squad.emoji} ${squad.name} · ${squad.members.length}/8 members`,
      description: "Join free on SQUADD — Social Pickleball",
      images: [
        {
          url: `https://hub.thecourtflow.com/api/og/squad?code=${code.toUpperCase()}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function JoinSquadPage({ params }: Props) {
  const { code } = await params;
  const squad = await fetchSquadByCode(code);

  if (!squad) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.emoji}>🔍</p>
          <h1 style={styles.title}>Squad not found</h1>
          <p style={styles.subtitle}>This invite link may have expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={styles.emoji}>{squad.emoji}</p>
        <h1 style={styles.title}>{squad.name}</h1>
        <p style={styles.subtitle}>
          {squad.members.length}/8 members · Level {squad.level}
        </p>
        <a
          href={`/download?code=${code.toUpperCase()}`}
          style={styles.cta}
        >
          📱 Download SQUADD & Join
        </a>
        <p style={styles.hint}>
          Code: <strong>{code.toUpperCase()}</strong>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0a0a0a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  card: {
    background: "#141414",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 20,
    padding: "48px 32px",
    textAlign: "center" as const,
    maxWidth: 400,
    width: "100%",
  },
  emoji: { fontSize: 64, margin: "0 0 16px" },
  title: {
    fontSize: 28,
    fontWeight: 900,
    color: "#facc15",
    margin: "0 0 8px",
  },
  subtitle: {
    fontSize: 14,
    color: "#a1a1aa",
    margin: "0 0 24px",
  },
  cta: {
    display: "block",
    background: "linear-gradient(to bottom, #a3e635, #65a30d)",
    color: "#000",
    fontWeight: 900,
    fontSize: 16,
    padding: "14px 24px",
    borderRadius: 12,
    textDecoration: "none",
    marginBottom: 12,
  },
  hint: { fontSize: 12, color: "#52525b" },
};
