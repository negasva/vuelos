# FlightTracker Co - Step 5 Workflow Rationale

The cron strategy is optimized for the free tier approach described in the project brief.

## Why these times

- Early morning, morning, midday, afternoon, evening, and late-night checks provide spaced sampling throughout the day.
- Six runs improve responsiveness while still staying lightweight enough for free-tier automation.

## Why GitHub Actions

- Free scheduled execution for lightweight automation.
- Easy secret management through repository secrets.
- Simple to adjust without redeploying the frontend.

## Why a ping-based workflow

- Keeps the cron logic inside the Vercel route where the app already lives.
- Avoids duplicating business logic inside GitHub Actions.
- Makes it easy to protect the route with a single bearer token.

