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

The scheduled GitHub Action (`.github/workflows/flight-cron.yml`) calls the
deployed `/api/cron/track-prices` endpoint, which fetches prices, stores
history and sends Telegram alerts. For it to work you must configure:

GitHub repository **Settings → Secrets and variables → Actions**:

- Variable (or secret) `APP_URL`: your public deployment URL, e.g.
  `https://your-app.vercel.app` (no trailing slash). Without it the workflow
  fails at the "Validate cron configuration" step — this is the error seen in
  failing runs.
- Secret `CRON_SECRET`: a random string; must match the app's `CRON_SECRET`.

Deployment environment variables (e.g. Vercel) — see `.env.local.example`:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (same value as the GitHub secret)
- `APIFY_API_TOKEN`
- `TELEGRAM_BOT_TOKEN` and optionally `TELEGRAM_DEFAULT_CHAT_ID`

Alerts are sent per tracked flight to the user's `telegram_chat_id` (or
`TELEGRAM_DEFAULT_CHAT_ID` as fallback) when the current price is at or below
the target price, drops 20%+ versus the previous check, or looks like an
error fare.

