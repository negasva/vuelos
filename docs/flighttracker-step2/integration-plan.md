# FlightTracker Co - Step 2 Integration Plan

This step defines the first integration layer for Amadeus and Telegram.

## 1. Supabase client strategy

Use two Supabase clients:

- Browser client: initialized with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server client: initialized with `SUPABASE_SERVICE_ROLE_KEY` for cron jobs, alert dispatching, and route synchronization.

Recommended structure:

```text
lib/
├── supabase-client.ts
└── supabase-server.ts
```

## 2. Amadeus integration strategy

Keep token acquisition server-side only.

Flow:

1. Read `AMADEUS_API_KEY` and `AMADEUS_API_SECRET`.
2. Request an access token from Amadeus.
3. Cache or reuse the token in memory during the server process lifetime when possible.
4. Call search endpoints using `AMADEUS_BASE_URL`.

Recommended helper files:

```text
lib/
├── amadeus-auth.ts
└── amadeus-search.ts
```

## 3. Telegram integration strategy

Keep Telegram messaging isolated in a single helper.

Flow:

1. Build a formatted message in a pure helper.
2. POST to `https://api.telegram.org/bot<TOKEN>/sendMessage`.
3. Send to the tracked user's `telegram_chat_id` if present.
4. Optionally fall back to `TELEGRAM_DEFAULT_CHAT_ID` during testing.

Recommended helper file:

```text
lib/telegram.ts
```

## 4. Cron protection

Protect `/api/cron/track-prices` with `CRON_SECRET`.

Recommended request pattern:

```http
Authorization: Bearer <CRON_SECRET>
```

## 5. Implementation order for the next step

1. Create `lib/supabase-client.ts` and `lib/supabase-server.ts`.
2. Create `lib/amadeus-auth.ts` for token retrieval.
3. Create `lib/telegram.ts` for alert dispatching.
4. Add the protected cron route in `app/api/cron/track-prices/route.ts`.

