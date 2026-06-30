# FlightTracker Co

Initial scaffold and setup notes for the flight price tracking project.

## Included

- Step 1: project structure and Supabase schema
- Step 2: environment variables and integration plan
- Step 3: backend architecture and cron route skeleton
- Step 4: frontend UI spec and component blueprint
- Step 5: GitHub Actions cron workflow

## Files

- `supabase/schema.sql`
- `.github/workflows/flight-cron.yml`
- `docs/flighttracker-step1/PROJECT_STRUCTURE.md`
- `docs/flighttracker-step1/supabase-schema.sql`
- `docs/flighttracker-step2/ENVIRONMENT_VARIABLES.md`
- `docs/flighttracker-step2/integration-plan.md`
- `docs/flighttracker-step3/BACKEND_ARCHITECTURE.md`
- `docs/flighttracker-step3/ALGORITHM_DETAILS.md`
- `docs/flighttracker-step3/route-skeleton.ts`
- `docs/flighttracker-step4/FRONTEND_UI_SPEC.md`
- `docs/flighttracker-step4/COMPONENT_BLUEPRINT.md`
- `docs/flighttracker-step4/dashboard-wireframe.md`
- `docs/flighttracker-step5/flight-cron-workflow.md`
- `docs/flighttracker-step5/workflow-rationale.md`

## Cron + notifications setup

The scheduled GitHub Action (`.github/workflows/flight-cron.yml`) runs
`scripts/track_prices.py`, which searches Google Flights with the free
[`fli`](https://github.com/punitarani/fli) library (no API key), records price
history in Supabase, and sends Telegram alerts — all inside the Action. No
Apify and no Vercel cron endpoint are needed.

Configure these in GitHub repository **Settings → Secrets and variables →
Actions**:

- `NEXT_PUBLIC_SUPABASE_URL` (variable or secret)
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `TELEGRAM_BOT_TOKEN` (secret)
- `TELEGRAM_DEFAULT_CHAT_ID` (optional; fallback chat for testing)

Alerts are sent per tracked flight to the user's `telegram_chat_id` (or
`TELEGRAM_DEFAULT_CHAT_ID` as fallback) when the current price is at or below
the target price, drops 20%+ versus the previous check, or looks like an error
fare. Each run prints a `SUMMARY: {...}` line in the Action log showing how many
flights were searched, how many alerts were triggered/sent, and the first error
if any.

Notes / limitations:
- `fli` queries Google Flights' internal API and can be rate-limited from
  datacenter IPs; runs are best-effort with built-in retries.
- The app stores no specific travel date, so the cron watches a rolling date
  ~30 days out (`SEARCH_LEAD_DAYS` in the script).
- Baggage / visa / night-only filters are not yet applied in the `fli` path
  (only stops + economy cabin); they remain stored on each alert.

The Next.js app (dashboard + `/api/tracked-flights`, `/api/price-history`,
`/api/settings`) still needs `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in its own deployment env. The legacy Apify-based
`/api/cron/track-prices` route remains in the repo but is no longer used by the
cron.

