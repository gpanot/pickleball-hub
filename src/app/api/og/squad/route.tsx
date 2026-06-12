import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Card dimensions — portrait, phone-shareable
const W = 600;
const H = 900;

const GOLD = "#facc15";
const LIME = "#a3e635";
const LIME_DARK = "#65a30d";
const BG = "#050f05";
const CARD_BG = "#0a1a0a";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const squadCode = await prisma.squadCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      squad: {
        include: {
          members: {
            where: { leftAt: null },
            include: {
              profile: {
                select: {
                  id: true,
                  displayName: true,
                  squadNickname: true,
                  reclubPlayer: { select: { duprDoubles: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!squadCode?.squad) {
    return new Response("Squad not found", { status: 404 });
  }

  const squad = squadCode.squad;
  const members = squad.members ?? [];
  const memberCount = members.length;
  const openSpots = Math.max(0, 8 - memberCount);

  // Founder profile
  const founderMember = members.find((m) => m.profileId === squad.founderId);
  const founderProfile = founderMember?.profile;
  const founderHandle = founderProfile?.squadNickname
    ? `@${founderProfile.squadNickname}`
    : founderProfile?.displayName ?? "Founder";
  const founderInitial = (
    founderProfile?.squadNickname ?? founderProfile?.displayName ?? "G"
  )
    .charAt(0)
    .toUpperCase();

  // Avg DUPR
  const duprValues = members
    .map((m) => m.profile?.reclubPlayer?.duprDoubles)
    .filter((v): v is { toNumber: () => number } | number => v != null)
    .map((v) => (typeof v === "object" ? v.toNumber() : Number(v)))
    .filter((v) => v > 0);
  const avgDupr =
    duprValues.length > 0
      ? (duprValues.reduce((a, b) => a + b, 0) / duprValues.length).toFixed(1)
      : null;

  // Member initials for crew row (max 5 + overflow)
  const visibleMembers = members.slice(0, 5);
  const overflow = memberCount - visibleMembers.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(160deg, #071507 0%, ${BG} 60%, #030803 100%)`,
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: "50%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${squad.color}18 0%, transparent 70%)`,
            transform: "translateX(-50%)",
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "24px 28px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🏓</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: LIME,
                letterSpacing: 2,
              }}
            >
              SQUADD
            </span>
          </div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 100,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: 1.5,
              display: "flex",
            }}
          >
            SQUAD INVITE
          </div>
        </div>

        {/* Emoji */}
        <div
          style={{
            fontSize: 80,
            textAlign: "center",
            marginTop: 28,
            marginBottom: 4,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {squad.emoji}
        </div>

        {/* Squad name */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: squad.color ?? GOLD,
            textAlign: "center",
            letterSpacing: 3,
            textShadow: "3px 3px 0px #000",
            padding: "0 24px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {squad.name.toUpperCase()}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            margin: "20px 24px 0",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 16,
            padding: "16px 0",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {[
            { value: `${memberCount}/8`, label: "MEMBERS" },
            { value: avgDupr ?? "—", label: "AVG DUPR" },
            { value: `Lv.${squad.level}`, label: "LEVEL" },
            { value: String(openSpots), label: "OPEN SPOTS" },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                borderRight:
                  i < arr.length - 1
                    ? "1px solid rgba(255,255,255,0.07)"
                    : "none",
              }}
            >
              <span
                style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#555",
                  marginTop: 4,
                  letterSpacing: 0.5,
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Crew so far */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            margin: "20px 24px 0",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#444",
              letterSpacing: 1,
              marginBottom: 10,
              display: "flex",
            }}
          >
            CREW SO FAR
          </span>
          <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
            {visibleMembers.map((m) => {
              const isFounder = m.profileId === squad.founderId;
              const initial = (
                m.profile?.squadNickname ?? m.profile?.displayName ?? "?"
              )
                .charAt(0)
                .toUpperCase();
              return (
                <div
                  key={m.id}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: "#1a2a1a",
                    border: `2px solid ${isFounder ? GOLD : "rgba(163,230,53,0.2)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#fff",
                    position: "relative",
                  }}
                >
                  {initial}
                  {isFounder && (
                    <span
                      style={{
                        position: "absolute",
                        top: -12,
                        fontSize: 12,
                        display: "flex",
                      }}
                    >
                      👑
                    </span>
                  )}
                </div>
              );
            })}
            {overflow > 0 && (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  background: "#1a1a1a",
                  border: "2px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#555",
                }}
              >
                +{overflow}
              </div>
            )}
            {Array.from({ length: Math.min(openSpots, 4) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  background: "transparent",
                  border: "2px dashed rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#333",
                }}
              >
                +
              </div>
            ))}
          </div>
        </div>

        {/* Founder card */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            margin: "20px 24px 0",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 16,
            padding: 16,
            border: "1px solid rgba(255,255,255,0.06)",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: "#1a2a1a",
              border: `2.5px solid ${GOLD}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
              color: "#fff",
              flexShrink: 0,
              position: "relative",
            }}
          >
            {founderInitial}
            <span
              style={{
                position: "absolute",
                top: -12,
                fontSize: 13,
                display: "flex",
              }}
            >
              👑
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{ fontSize: 15, fontWeight: 800, color: GOLD }}
              >
                {founderHandle}
              </span>
              <span style={{ fontSize: 13, color: "#555" }}>· Founder</span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#888",
                marginTop: 2,
                display: "flex",
              }}
            >
              {founderProfile?.reclubPlayer?.duprDoubles
                ? `DUPR ${Number(founderProfile.reclubPlayer.duprDoubles).toFixed(1)}`
                : "No DUPR yet"}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#a1a1aa",
                fontStyle: "italic",
                marginTop: 6,
                lineHeight: 1.5,
                display: "flex",
              }}
            >
              "Join {squad.name} — every session earns chest rewards 💪"
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Download CTA */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            margin: "0 24px 0",
            background: `linear-gradient(90deg, ${LIME} 0%, ${LIME_DARK} 100%)`,
            borderRadius: 16,
            padding: "18px 24px",
            borderBottom: `4px solid #365314`,
          }}
        >
          <span
            style={{ fontSize: 17, fontWeight: 900, color: "#000" }}
          >
            📱 Download SQUADD & join {squad.name}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(0,0,0,0.55)",
              marginTop: 4,
              display: "flex",
            }}
          >
            Free · auto-joins your squad on install
          </span>
        </div>

        {/* Footer link */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            margin: "14px 24px 28px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 12,
            padding: "12px 16px",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <span style={{ fontSize: 18, display: "flex" }}>🔗</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: LIME }}>
              hub.thecourtflow.com/join/{code.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#444",
                marginTop: 2,
                display: "flex",
              }}
            >
              Squad code : {code.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H }
  );
}
