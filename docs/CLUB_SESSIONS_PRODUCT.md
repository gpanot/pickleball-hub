# Club Sessions — Product Document

**Product surface:** Sessions tab (bottom nav)  
**Status:** Shipped in SQUADD mobile (Expo)  
**Last updated:** 2026-08-02  
**Audience:** Product, design, eng, club owners evaluating the feature  

---

## 1. What it is

**Club Sessions** is SQUADD’s native host-and-book loop for open play. A player creates an **App Club** once, publishes **sessions** under that club (date, venue, capacity, fee, level), and other players **find and book** those sessions in-app.

It is intentionally **Reclub-independent**: booking, roster, paid/check-in, and cancels live on SQUADD’s own APIs and Postgres models (`AppClub`, `ClubSession`, `ClubSessionBooking`). No in-app payment processing — hosts track meet fees and attendance manually, the same operational model hosts already use offline / on Reclub.

**Tab label in the app:** “Sessions” (calendar icon). Internally still referred to as Club Sessions / CS.

**Bottom nav (left → right):** Circle · Sessions · My Business · Logbook.

---

## 2. Who it’s for

| Persona | Goal |
|--------|------|
| **Club owner / host** | Run a club identity, publish games, fill courts, approve requests, track paid + attendance on the day |
| **Co-manager** (partial) | Help run sessions under the same club (API exists; add-manager UI is incomplete) |
| **Player / booker** | Discover public sessions, see who’s going + DUPR mix, book / request / waitlist, cancel when plans change |

---

## 3. Product principles (as built)

1. **Club first, then sessions** — A session always belongs to one App Club. One club per *creator* (anti-sprawl).
2. **Soft capacity** — `maxPlayers` is a target, not a hard gate. Hosts can over-confirm for expected no-shows.
3. **Transparent status** — Confirmed / Pending / Waiting / Declined are first-class in UI and push.
4. **Manual ops, not payments** — Paid toggle + check-in / no-show are host tools; money stays outside the app.
5. **Role-adaptive screens** — Same Club Detail / Session Detail adapt for host vs player (hosts of a session land on management, not the player book CTA).

---

## 4. Information architecture

### 4.1 Entry & gating

```
Tap Sessions tab
  ├─ Not signed in     → CS Sign-in (Google / Apple)
  ├─ Profile incomplete → CS identity onboarding
  │                      (nickname → avatar → DUPR → Reclub link → follow players)
  └─ Ready             → Sessions Home (S1)
```

Onboarding for this tab is isolated from Squadd game onboarding. Tab bar stays visible on sign-in; hidden during identity onboarding.

### 4.2 Sessions home — two sub-tabs

| Sub-tab | Purpose | Empty state |
|--------|---------|-------------|
| **My Sessions** | Player’s upcoming bookings (Confirmed / Pending / Waiting) | “No upcoming bookings” → CTA **Find a session** |
| **Find** | Browse public sessions (+ Top 5 / Friends sub-modes) | “No sessions found” → clear filters / adjust search |

**Find** sub-modes:

- **Club Sessions** — public native sessions (search + filters: when, distance, etc.)
- **Top 5** — reused Play ranking surface
- **Friends** — friends-going social surface

Header: title “Club Sessions”, avatar → **Profile**.

### 4.2b My Business — two sub-tabs

Separate bottom-nav destination (briefcase icon). Same CS auth gate applies.

| Sub-tab | Purpose | Empty state |
|--------|---------|-------------|
| **My Club** | Host cockpit: club hero card + today’s sessions | “No club yet” → CTA **Go to profile** (create club) |
| **Dashboard** | Business insights and stats for club owners | Placeholder — stats wired here in a future iteration |

Header: title “My Business”, avatar → **Profile**.

**FAB behavior** (My Club sub-tab)

| Context | FAB action |
|--------|------------|
| User has a club | Create session |
| No club yet | Create club |

FAB only renders when the user already manages a club.

### 4.3 Profile (avatar from Home)

Unified profile shared with the rest of the app, with a **MY CLUB** block:

- **Has club** → club row (name, session count, member count) → Club Detail  
- **No club** → **Create your club** → Create Club form  

Also: My Sessions list, settings (theme, notifications, language, gear, Reclub link/unlink), account.

---

## 5. End-to-end flows (shipped today)

### 5.1 Empty → create club → first session

```
My Business → My Club (empty)
  → Go to profile
  → Create your club
  → Create Club form (name *, icon, privacy, auto-approve members)
  → Save → Club Detail

Club Detail FAB (or My Club FAB create path)
  → Create Session
  → Preview Draft (player-facing preview)
  → Publish → Published Mgmt (host view)
```

**Create Club fields**

| Field | UI | Notes |
|------|----|-------|
| Club name | Text input | Required |
| Icon | Pill row (Shield / Award / Target / Zap) | Stored as icon id |
| Privacy | Public / Private pills | |
| Auto-approve new members | Switch (default on) | Club-level join policy |
| Level | Default “All levels” | Set at create; editable later |

Constraint: **one club per creator** (API `409` if they try again).

### 5.2 Create / publish a session

**Create Session controls**

| Control | Widget |
|--------|--------|
| Sport | Pills: Pickleball, Paddle, Badminton |
| Format | Social, Round Robin *(disabled)*, Singles |
| Host role | Host & play / Host only |
| Session name | Text |
| Date | Custom calendar modal |
| Start time | 30-min slots 6:00–23:00 |
| Duration | 1h–5h + All day |
| Venue | Venue picker + “To be determined” |
| Capacity | Stepper (soft target) |
| Meet fee | Free / Per person (+ amount, currency from prefs) |
| Require approval | Switch (advanced) |
| Min / Max level | Sport-aware level dropdowns |
| Notes | Free text |

Flow: Create → **Preview Draft** (exact player-facing card) → **Publish** or **Save draft**. Drafts reopen from Club Detail / My Club with a **DRAFT** badge.

### 5.3 Host: manage a live session

**Published Mgmt (“Your Session”)**

- Hero: LIVE / CANCELLED badge, fill bar (`confirmed / max`), avatar stack, over-target hint  
- **Share session link** → OS share sheet  
- **Inline roster & approvals** with filter pills: All · Confirmed · Waiting · Requested  
- Per booking (optimistic UI):
  - Approve / waitlist / decline (requested)
  - Promote / demote across statuses
  - **Paid** toggle
  - **Attendance**: unmarked → IN → NO-SHOW (cycle)
- Overflow (⋯): Edit session · Cancel session · Delete session  

Cancel → confirmation sheet → Session Cancelled terminal → Home.  
Cancelled sessions can be **republished** from management.

**Edit Session** mirrors Create (full parity) with a warning banner if bookings already exist.

### 5.4 Player: discover → book → manage booking

```
Find (or search) → Session Detail
  → Book a spot          (instant confirm if !requiresApproval)
  → Request to join      (requiresApproval)
  → Request waiting list (session at/over target & no booking)
  → Booking Confirmation
```

Session Detail shows:

- Club, datetime, format, level, fee  
- Level self-check banner vs user’s DUPR  
- Venue card  
- **Who’s playing** grid with avatars + DUPR  
- Host notes  
- Adaptive footer CTA / status  

If the viewer is host/manager → redirected to **Published Mgmt** (no player book flash).

Cancel own booking from Session Detail / My Booking → Booking Cancelled.  
**Waitlist auto-backfill:** when a confirmed player cancels, longest-waiting waitlisted player is promoted and notified.

### 5.5 Club Detail (shared)

- Hero: name, privacy, level, member count  
- Managers: edit pencil → Edit Club  
- Upcoming / Past session lists with LIVE / DRAFT / CANCELLED badges and spots left  
- Manager FAB → Create Session  
- Player path: tap session → Session Detail (book)

**Note:** One-tap **Join club** is supported by `POST /api/memberships` on the backend; the Club Detail UI does **not** currently expose a Join CTA (product gap — see §8).

### 5.6 Notifications (push)

| Trigger | Recipient |
|--------|-----------|
| Booking requested (approval on) | Host |
| Confirmed / waitlisted / declined | Player |
| Auto-backfill promoted | Player |
| Session cancelled by host | Confirmed + waitlisted players |
| Confirmed player cancels | Host |

Deep-links resolve into Home → Published Mgmt or Session Detail as appropriate. Copy is locale-aware (profile language preference).

---

## 6. UI / UX summary

### Visual language

- Glass cards, indigo gradient accent (`#667EEA` → purple end), soft borders  
- Display type (Bangers) on club names in places; system UI elsewhere  
- Status chips with consistent color semantics:
  - **LIVE** green · **DRAFT** blue · **CANCELLED** red  
  - Booking: CONFIRMED / PENDING / WAITING / DECLINED  

### UX patterns that matter

| Pattern | Why it works |
|--------|----------------|
| Three home jobs (booked / find / host) | Separates player vs host mental models without two apps |
| Empty states with a single next action | Empty My Club → Profile; empty bookings → Find |
| Preview before publish | Hosts see the player card before going live |
| Soft fill bar + over-target | Matches real open-play ops (overbook for no-shows) |
| Optimistic roster actions | Day-of check-in feels instant |
| Host redirect on Session Detail | Avoids “book your own session” dead-end |
| Share via OS sheet | Lowest-friction distribution (chat / Zalo / iMessage) |

### Friction & clarity notes (current UX)

- Creating a club from My Club empty state goes **via Profile**, not a one-tap Create Club on that empty state (intentional identity framing; slightly longer path).  
- FAB create-club vs Profile create-club both exist depending on entry — works, but messaging should stay aligned (“create club to host”).  
- Round Robin format is visible but disabled — can look like a bug without helper copy.  
- “Add manager” is shown on Edit Club but not wired in UI (dead control).  
- Club member list / Join club are thin or missing in UI despite membership APIs.  
- Find mixes native Club Sessions with Top 5 / Friends (Reclub-era surfaces) — powerful for players, slightly blurry “what is this tab?” story for new hosts.

---

## 7. User stories

### 7.1 Club owner / host — supported today

| ID | Story | Status |
|----|--------|--------|
| H1 | As a host, I create a club with name, icon, and privacy so I have a home for the games I run | ✅ |
| H2 | As a host, I edit club details (name, privacy, auto-approve) anytime | ✅ |
| H3 | As a host, I create a session (date, time, venue/TBD, capacity, fee, level, approval) in one form | ✅ |
| H4 | As a host, I preview the player-facing card before publishing | ✅ |
| H5 | As a host, I save a draft and finish later | ✅ |
| H6 | As a host, I see fill status and who’s confirmed on my session | ✅ |
| H7 | As a host, I approve, waitlist, or decline join requests | ✅ |
| H8 | As a host, I confirm past target capacity when I expect no-shows | ✅ |
| H9 | As a host, I mark paid / checked-in / no-show on the day | ✅ |
| H10 | As a host, I edit a published session and am warned if people already booked | ✅ |
| H11 | As a host, I cancel a session and players are notified | ✅ |
| H12 | As a host, I get notified when a confirmed player cancels | ✅ |
| H13 | As a host, I share a session link from management | ✅ |
| H14 | As a host, I delete a session I no longer need | ✅ |
| H15 | As a host, I republish a cancelled session | ✅ |

### 7.2 Club owner / host — not yet (or incomplete)

| ID | Story | Gap |
|----|--------|-----|
| H16 | As a host, I add co-managers so someone else can run sessions when I’m away | API yes · UI stub |
| H17 | As a host, I remove a co-manager | Not built |
| H18 | As a host, I see and message my member list | No member directory / chat |
| H19 | As a host, I duplicate or schedule a recurring weekly session | No recurrence / duplicate |
| H20 | As a host, I see club-level analytics (fill rate, no-show %, revenue tracked) | No dashboards |
| H21 | As a host, I collect or confirm digital payment | Explicitly out of v1 |
| H22 | As a host, I export a roster / paid list for the venue | No export |
| H23 | As a host, I set a default venue / fee template for faster create | No templates |
| H24 | As a host, I broadcast to all members about a new session | Only share-link + public Find |
| H25 | As a creator, I transfer ownership if I leave the city | No ownership transfer |

### 7.3 Player — supported today

| ID | Story | Status |
|----|--------|--------|
| P1 | As a player, I browse upcoming public sessions with search/filters | ✅ |
| P2 | As a player, I see who’s confirmed and DUPR mix before booking | ✅ |
| P3 | As a player, I book in one tap when approval is off | ✅ |
| P4 | As a player, I request to join when approval is on | ✅ |
| P5 | As a player, I join a waiting list when the session is full | ✅ |
| P6 | As a player, I always know my status (confirmed / pending / waiting) | ✅ |
| P7 | As a player, I get push when my status changes or a session is cancelled | ✅ |
| P8 | As a player, I cancel my booking and free the spot | ✅ |
| P9 | As a player, I get auto-promoted from waitlist when a spot opens | ✅ |
| P10 | As a player, I see my upcoming bookings under My Sessions | ✅ |

### 7.4 Player — gaps

| ID | Story | Gap |
|----|--------|-----|
| P11 | As a player, I join a club with one tap from Club Detail | API yes · UI missing |
| P12 | As a player, I follow a club and get notified of new sessions | No club follow / notify-all |
| P13 | As a player, I pay the meet fee in-app | Out of scope v1 |
| P14 | As a player, I rate the session / host after play | Not built |

---

## 8. Product gaps focused on club owners

Prioritized by how often real hosts hit them when running weekly open play.

### P0 — Blocks multi-host clubs

1. **Add / invite manager UI** — Edit Club shows “Add manager” with no picker or invite flow; API `POST /api/app-clubs/[id]/managers` is ready. Without this, only the creator can operationalize the club.  
2. **Manager removal + basic hierarchy** — Spec deferred removal; real clubs need “remove inactive co-host.”

### P1 — Daily ops pain

3. **Recurring sessions / duplicate last week** — Hosts recreate the same Tue 7pm every week by hand.  
4. **Create-session templates** (default venue, fee, capacity, approval, level).  
5. **Member directory on Club Detail** — Count exists; list + contact context doesn’t.  
6. **Join club CTA for players** — Membership API exists; discovery of “my clubs I’m a member of” (vs managed) is weak.  
7. **Host day-of checklist** — Paid + attendance exist, but no “start session” mode (large type, offline-friendly, sorted unchecked-first).

### P2 — Growth & retention for hosts

8. **Notify club members** when a new session publishes (push / in-app).  
9. **Club share page / QR** (parallel to player QR) for Zalo groups.  
10. **Simple host stats** — fill %, no-show rate, sessions hosted this month.  
11. **Private club discovery rules** — Private privacy exists; invite/link-only join path needs productization.  
12. **Round Robin (and richer formats)** — UI teases Round Robin but disables it.

### P3 — Later / strategic

13. In-app or linked payments (VNPay / bank note / “mark paid via QR”).  
14. Squad / chest / XP hooks when a Club Session completes.  
15. Multi-club creator (franchise / multi-venue organizers) — conflicts with current one-club-per-creator rule.  
16. Web host console for roster on a laptop at the court desk.

---

## 9. Suggested roadmap

### Now → Next 30 days (make hosting reliable for 1–2 person clubs)

| Item | Outcome |
|------|---------|
| Wire **Add manager** (search player / paste profile / pick from followers) | Real co-hosts can run Published Mgmt |
| Remove or hide dead **Add manager** affordance until ready | Stop false confidence |
| **Join club** CTA on Club Detail + “Joined” state | Membership model becomes real in product |
| **Duplicate session** action on Published Mgmt / Club Detail | Cuts weekly recreate time |
| Empty My Club → primary **Create club** CTA (keep Profile path secondary) | Shorter first-host path |
| Helper copy on disabled Round Robin | Clarity |

### Next quarter (host ops & growth)

| Item | Outcome |
|------|---------|
| Recurring series (weekly / custom) with single cancel-occurrence | Core open-play pattern |
| Session templates per club | Faster publish |
| Member list + “notify members” on publish | Fill without leaving to Zalo every time |
| Club share link / QR | Offline → app acquisition |
| Day-of host mode (attendance-first layout) | Court-side usability |
| Host mini-stats on My Club | Habit loop / pride metrics |
| Manager remove + creator-only delete club | Safe multi-host governance |

### Later (platform)

| Item | Outcome |
|------|---------|
| Optional payment proofs / QR mark-paid assist | Still manual settlement, less awkward |
| Format expansion (true Round Robin tools) | Differentiate vs simple Social |
| Cross-link finished Club Sessions → Logbook / Feed / Squadd XP | One player identity across tabs |
| Soft multi-club for verified organizers | Serve venue-side power hosts without spam |

---

## 10. Success signals (suggested)

| Metric | Why |
|--------|-----|
| % of Sessions-tab users who create a club | Host activation |
| Time from club create → first published session | Onboarding friction |
| Median fill rate at start time (`confirmed / max`) | Session quality |
| % sessions with ≥1 co-manager action (once multi-host ships) | Ops realism |
| Booking → cancel rate / waitlist promote rate | Marketplace health |
| Host 7-day retention after first publish | Habit formation |

---

## 11. Screen map (quick reference)

| Screen | Role | In tab stack |
|--------|------|--------------|
| Home (My Sessions / Find / My Club) | Shared | ✓ |
| Profile | Shared | ✓ |
| Create Club / Edit Club | Host | Modal-ish stack |
| Club Detail | Shared | ✓ |
| Create Session / Edit Session | Host | ✓ |
| Preview Draft | Host | ✓ |
| Published Mgmt (+ inline roster) | Host | ✓ |
| Cancel / Delete sheets | Host | Sheets |
| Session Cancelled / Booking Cancelled | Terminal | ✓ |
| Search / Calendar | Shared | ✓ |
| Session Detail | Player (host redirected) | ✓ |
| Booking Confirmation / My Booking | Player | ✓ |
| My Sessions (from Profile) | Shared | ✓ |
| CS Sign-in / CS onboarding | Gate | Outside main stack |

Legacy note: `RosterCheckInScreen` and `QuickCreateClubScreen` still exist in the codebase; primary host roster UX is **inline on Published Mgmt**. Quick Create was removed from the main FAB path in favor of full Create Club.

---

## 12. One-line product summary

**Sessions** turns SQUADD into a place where a host can stand up a club, publish open play, fill a court with transparent booking states, and run day-of paid/check-in — without depending on Reclub — while players discover and book those games next to the social Find surfaces they already know.

---

*Companion eng docs:* [club-sessions-screens.md](../../club-sessions-screens.md) · [club_sessions_spec.md](../../Clone%20Reclub%20spec/club_sessions_spec.md) · Mobile module: `mobile/src/modules/club-sessions/`
