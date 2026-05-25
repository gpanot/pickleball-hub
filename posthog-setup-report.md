<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the HCM Pickleball Hub project. PostHog JS (`posthog-js`) and the Node SDK (`posthog-node`) were installed. A client-side initialization file (`instrumentation-client.ts`) was created using the Next.js 15.3+ instrumentation pattern. The `next.config.ts` was updated to add a reverse proxy for PostHog ingestion (avoiding ad-blockers). A server-side PostHog client (`src/lib/posthog-server.ts`) was created for API route tracking. Environment variables were added to `.env.local`. Eleven events were instrumented across 7 files covering the core conversion funnel (session discovery → booking), sharing behavior, onboarding, community engagement, and server-side profile linking.

| Event | Description | File |
|---|---|---|
| `session_card_clicked` | User clicks a session card to open the booking preview sheet | `src/components/HomeClient.tsx` |
| `session_booking_clicked` | User clicks "Continue to Reclub" in the booking preview sheet — main conversion CTA | `src/components/SessionBookPreviewSheet.tsx` |
| `session_shared` | User shares a session from the booking preview sheet | `src/components/SessionBookPreviewSheet.tsx` |
| `session_detail_booking_clicked` | User clicks "Book on Reclub" from the session public detail page | `src/components/SessionPublicDetail.tsx` |
| `session_detail_shared` | User shares a session from the session public detail page | `src/components/SessionPublicDetail.tsx` |
| `app_shared` | User clicks the floating "Share with friends" pill on the home page | `src/components/HomeClient.tsx` |
| `onboarding_completed` | User completes all 3 steps of the player preferences onboarding | `src/components/OnboardingQnA.tsx` |
| `zalo_profile_saved` | User submits their Zalo ID in the ZaloPrompt form | `src/components/ZaloPrompt.tsx` |
| `session_sort_changed` | User changes the sort/filter on the session list | `src/components/SessionFilters.tsx` |
| `club_viewed_on_reclub` | User clicks "View on Reclub" from a club profile page | `src/app/clubs/[slug]/page.tsx` |
| `profile_linked` | User links their anonymous player profile to their authenticated account (server-side) | `src/app/api/auth/link-profile/route.ts` |

## LLM analytics

PostHog LLM analytics was added to all three server-side AI call sites using manual `$ai_generation` capture (via `posthog-node`, which was already installed). No additional packages were needed. Each LLM call now emits a `$ai_generation` event with model, provider, token counts, estimated cost, and latency — visible in PostHog's **LLM Analytics** → **Traces** and **Generations** tabs.

| File | Span name | Providers covered |
|---|---|---|
| `src/app/api/heatmap/ai-chat/route.ts` | `pickle_pete_chat` | Anthropic, DeepSeek |
| `src/lib/ai-assistant/chat.ts` | `pickle_pete_admin_chat` | Anthropic, DeepSeek |
| `src/app/api/admin/generate/route.ts` | `content_generation` | Anthropic |

Properties captured on every `$ai_generation` event:
- `$ai_trace_id` — session ID (groups all turns in a conversation) or unique per-request ID
- `$ai_model` — the model name (e.g. `claude-haiku-4-5-20251001`, `deepseek-chat`)
- `$ai_provider` — `anthropic` or `deepseek`
- `$ai_input_tokens` / `$ai_output_tokens`
- `$ai_total_cost_usd` — pre-calculated using the project's existing cost estimator
- `$ai_latency` — wall-clock seconds for the LLM call

[View LLM Generations in PostHog](/llm-analytics/generations)

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1625090)
- [Session Booking Conversion Funnel](/insights/itK1afWJ) — drop-off from card click to booking CTA
- [Booking Clicks Over Time](/insights/4TVugFb5) — daily volume of "Book on Reclub" clicks
- [Session Shares Over Time](/insights/HgUxk2qG) — virality signal via session sharing
- [Onboarding Completions](/insights/GMJH56Sx) — new user activation rate
- [Community & Club Engagement](/insights/huBnLFG0) — Zalo profile saves and club page clicks

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
