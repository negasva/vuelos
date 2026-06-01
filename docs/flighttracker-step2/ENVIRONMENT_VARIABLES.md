# FlightTracker Co - Step 2 Environment Setup

These variables are the minimum needed to wire the app to Supabase, Amadeus, and Telegram without hard-coding secrets.

## Local environment file

Create a local `.env.local` from the example below:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

AMADEUS_API_KEY=
AMADEUS_API_SECRET=
AMADEUS_BASE_URL=https://test.api.amadeus.com

TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_CHAT_ID=

CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Variable purpose

- `NEXT_PUBLIC_SUPABASE_URL`: Public Supabase project URL for browser-safe client initialization.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase anon key for authenticated frontend reads/writes.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key for cron jobs and privileged backend tasks.
- `AMADEUS_API_KEY` / `AMADEUS_API_SECRET`: Credentials used to obtain an access token for Amadeus APIs.
- `AMADEUS_BASE_URL`: Base URL for Amadeus Self-Service APIs. Use the test URL first.
- `TELEGRAM_BOT_TOKEN`: Bot token used for `sendMessage` requests.
- `TELEGRAM_DEFAULT_CHAT_ID`: Optional fallback chat ID for testing alerts.
- `CRON_SECRET`: Shared secret used to protect the cron endpoint.
- `NEXT_PUBLIC_APP_URL`: Public app origin used when building links in notifications.

## Security rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `AMADEUS_API_SECRET`, `TELEGRAM_BOT_TOKEN`, or `CRON_SECRET` to the browser.
- Keep server-only values inside route handlers, server actions, cron jobs, or backend utilities.
- Use the `NEXT_PUBLIC_` prefix only for values that are safe to ship to the client.

