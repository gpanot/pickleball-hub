# SQUADD Mobile — Current App & Functionalities

**Last updated:** July 2026  
**App name:** SQUADD (slug: `the-hub`)  
**Version:** 1.1.0  
**Bundle / package:** `com.squadd.thehub.app`  
**Stack:** Expo 54 · React Native 0.81 · Firebase Messaging · PostHog  
**Backend:** Pickleball Hub API (Next.js on Railway)  
**Primary market:** Ho Chi Minh City pickleball players  

> **Scope note:** The **Squadd game** (squads, chests, conquest, gamified onboarding) is **excluded from the product surface** for now. The bottom tab bar exposes only **Circle** and **Sessions**. Game code may still exist in the repo but is not part of the shipped experience documented here.

---

## Product thesis

SQUADD is a **social-first pickleball companion** on top of **Reclub** session data. It helps players answer:

1. **Who’s playing?** — Circle feed, presence, follows, friends going  
2. **Where should I play?** — ranked Top 5, public club sessions, filters by distance / time / level  
3. **How do I host?** — create a club, publish sessions, manage roster & check-in  

Booking open-play Reclub events still opens via Reclub `eventUrl`. Club Sessions supports in-app booking for host-created sessions.

---

## Information architecture

### Bottom tabs (shipped)

| Tab | Label | Role |
|-----|-------|------|
| **Circle** | Circle | Social feed, presence, players, follows, activity |
| **Sessions** | Sessions | Discover / book sessions + host club management |

Floating glass tab bar; hides on scroll in Circle and on create/edit forms in Sessions.

### Full-screen flows (not tabs)

- Splash  
- Guest Reclub link → guest follow players  
- Identity onboarding (`CsOnboardingOrchestrator`)  
- Reclub link (signed-in)  
- Gear setup  
- Profile sheet / settings  
- Push debug (support)  

---

## Authentication & identity

### Sign-in

- **Google** (production / dev client builds)  
- **Apple** (iOS)  
- JWT stored in Secure Store; `authedFetch` for private APIs  

### Guest path

Users can browse Circle without an account:

1. Link a Reclub player (search by name)  
2. Follow co-players  
3. Later sign in → short onboarding (`post-guest`: nickname → avatar → DUPR)  
4. Ghost follows + Reclub link are replayed after sign-in  

### Identity onboarding (Circle / Sessions)

Isolated from Squadd game onboarding. Modes:

| Mode | Steps |
|------|--------|
| `full-identity` | Nickname → Avatar → DUPR → Reclub → Follow players |
| `post-guest` | Nickname → Avatar → DUPR only |

Triggered when signing in from Circle or Sessions if profile is incomplete. Existing users with a nickname skip straight to Sessions home.

### Profile settings

- Avatar, nickname, DUPR (editable)  
- Reclub link status / link CTA  
- My Gear  
- Appearance (light / dark)  
- Notifications on/off  
- Sign out  
- Delete all my data  
- Push diagnostics / FCM debug (support)  

---

## Circle tab

Social hub for followed players and court activity.

### My Feed

Activity stream for people you follow (and self events), including:

| Feed type | Meaning |
|-----------|---------|
| `joining` | Friend booked / joining a session |
| `played` / `played_today` / `played_self` | Session completed |
| `you_are_playing` | You’re on a roster |
| `dupr_update` | DUPR change |
| `just_followed` / `new_follower` | Follow graph events |
| `streak_milestone` | Play streak |
| `gear_setup` | Friend set up gear |

Also supports:

- Pull-to-refresh and pagination  
- **Kudos** reactions (fistbump / flame / star) on feed items  
- **Presence** card — who’s at courts now / soon (expandable roster)  
- Empty state with **co-player suggestions** (players you’ve shared sessions with)  
- Deep-link from push (new follower, kudos targets, etc.)  

### Players

- List of followed players (search, open profile)  
- Co-player / “people you may know” suggestions  
- Guest CTA to link Reclub and start following  

### Activity

Full-screen list of kudos and follows received (paginated).

### Player profile sheet

- DUPR, follow counts, follow/unfollow  
- Recent venues / shared history  
- View gear  
- Give kudos  

### Other Circle behaviors

- Sign-in prompt for guests  
- Notification permission sheet (in-app, then OS prompt)  
- Gear teaser when setup incomplete  
- Link Reclub banner when not linked  

---

## Sessions tab (Club Sessions)

Role-adaptive: **player** (browse & book) and **host** (club + session management).

### Sign-in gate

Unsigned users see `CSSignInScreen`, then identity onboarding if needed, then home.

### Home — three top tabs

#### 1. My Sessions

Upcoming bookings (confirmed / requested / waiting list). Opens booking or session detail.

#### 2. Find

Browse discovery with sub-tabs:

| Sub-tab | What it does |
|---------|----------------|
| **Club Sessions** | Public host-created sessions (search / filters) |
| **Top 5** | Ranked Reclub open-play sessions by **match score** (DUPR fit, fill, returning players, distance). Filters: date, time slot, etc. Location permission for distance ranking. Opens Reclub via `eventUrl`. |
| **Friends** | Friends going today / tomorrow; play-intent strip; session cards with friend avatars on roster |

#### 3. My Club

Host view:

- Club card (or empty state → create club)  
- Today’s upcoming hosted sessions  
- FAB → create session (or quick-create club if none)  

### Host flow (summary)

| Screen | Purpose |
|--------|---------|
| Quick / Create Club | Create club (name, details) |
| Edit Club | Update club |
| Create Session | Venue (Google Places), time, format, capacity, skill, pricing |
| Preview Draft | Review before publish |
| Published Management | Host view of a live session |
| Edit Session | Edit with warning if bookings exist |
| Cancel / Delete sheets | Soft cancel vs hard delete |
| Roster & Check-in | Approvals, waiting list, check-in pills |
| Session Cancelled | Terminal confirmation |

### Player flow (summary)

| Screen | Purpose |
|--------|---------|
| Search Calendar | Browse public sessions |
| Session Detail | Adaptive CTA (book / join waitlist / view booking) |
| Booking Confirmation | Success after book |
| My Booking | View / cancel booking |
| Booking Cancelled | Terminal confirmation |
| My Sessions (profile) | Playing vs hosting lists |

### Profile (inside Sessions)

Avatar, DUPR, club card, My Sessions, Reclub link, sign-out — aligned with Circle profile where relevant.

---

## Cross-cutting features

### Reclub linking

Search Reclub players by name → bind `reclubUserId` to profile → optional follow co-players. Available as guest flow, onboarding step, profile CTA, or dedicated full-screen linker.

### Gear

Avatar-based setup for **cap / shirt / paddle / shoes** (brand picks). View others’ gear from profiles and feed. Shown in Circle and Sessions.

### Location

Used to rank nearby sessions (Top 5 / Find). In-app permission sheets before OS prompt.

### Push notifications (FCM)

- Token register after auth (permission via in-app sheet)  
- Toggle in profile suppresses display  
- Circle: follows, kudos, social alerts  
- Sessions: `cs_*` / Club Sessions types → open Sessions tab  
- Support: Push Debug screen (token, permission, event log)  

> Squadd/conquest push handlers may still exist in code; they are out of scope for the current product.

### Theme & analytics

- Light / dark appearance  
- PostHog (incl. session replay)  

---

## What is intentionally excluded

| Area | Status |
|------|--------|
| **Squadd game tab** | Not in bottom nav |
| Squads, invites, chests, tokens | Not product surface |
| Conquest / territory battles | Not product surface |
| Squadd gamified onboarding (YOU / GANG / CLUBHOUSE / REWARDS) | Not used; CS identity funnel only |

---

## Tech map (where things live)

```
mobile/
  App.tsx                          # Boot, tabs, guest/CS flows, PNS routing
  src/screens/CircleScreen.tsx     # Circle tab
  src/screens/ActivityScreen.tsx
  src/screens/ReclubLinkScreen.tsx / Guest*
  src/cs-onboarding/               # Identity onboarding (Circle + Sessions)
  src/modules/club-sessions/       # Sessions tab + host/player screens
  src/components/play/             # Top 5 + Friends (embedded in Sessions Find)
  src/components/gear/             # Gear setup / view
  src/components/ProfileSheet.tsx
  src/modules/squad/               # Squadd game (excluded from UI)
```

---

## Related docs

- [HCM Pickleball Hub README](../README.md) — web hub, ingest, analytics  
- Older overview (includes Squadd waitlist era): [SQUADD_MOBILE_PRODUCT.md](./SQUADD_MOBILE_PRODUCT.md)  
