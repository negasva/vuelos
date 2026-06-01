# FlightTracker Co - Step 3 Backend Architecture

This step defines the backend contract for intelligent price tracking, grouped searches, route scoring, and Telegram alerts.

## Goal

Build a server-only pipeline that can:

- Read active tracked flights from Supabase.
- Group identical searches to reduce API usage.
- Query Amadeus or Kiwi only once per unique search group.
- Compare round-trip and mixed-airline combinations.
- Detect likely error fares.
- Persist results and trigger Telegram notifications.

## Proposed server modules

```text
app/
└── api/
    └── cron/
        └── track-prices/
            └── route.ts

lib/
├── amadeus-auth.ts
├── amadeus-search.ts
├── flight-grouping.ts
├── flight-pricing.ts
├── fare-anomaly.ts
├── notifications.ts
└── telegram.ts
```

## Request contract

The cron endpoint should accept only authenticated requests:

```http
GET /api/cron/track-prices
Authorization: Bearer <CRON_SECRET>
```

Recommended response shapes:

```json
{ "ok": true, "groupsProcessed": 4, "alertsSent": 2 }
```

```json
{ "ok": false, "error": "Unauthorized" }
```

## Execution flow

1. Validate the `Authorization` header.
2. Load all active `tracked_flights`.
3. Normalize each search into a deduplication key.
4. Group flights with identical search parameters.
5. Query the external fare provider once per group.
6. Expand the shared result back to each matching tracked flight.
7. Compare the current fare against historical averages and the user's target price.
8. Flag any dramatic drop as a possible error fare.
9. Persist the price snapshot in `price_history`.
10. Send Telegram alerts when thresholds are crossed.

## Key design rule

All expensive network calls should happen after grouping, never before.

