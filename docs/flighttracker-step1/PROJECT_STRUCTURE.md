# FlightTracker Co - Step 1 Scaffold

This is the initial project layout to support the dashboard, API routes, database access, and future cron automation.

```text
flighttracker-co/
├── app/
│   ├── api/
│   │   └── cron/
│   │       └── track-prices/
│   │           └── route.ts
│   ├── dashboard/
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── dashboard/
│   │   ├── active-alerts.tsx
│   │   ├── price-history-chart.tsx
│   │   └── search-form.tsx
│   └── ui/
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── switch.tsx
├── lib/
│   ├── amadeus.ts
│   ├── db.ts
│   ├── telegram.ts
│   └── types.ts
├── supabase/
│   └── schema.sql
├── .github/
│   └── workflows/
│       └── flight-cron.yml
├── .env.local.example
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

Recommended notes for later steps:

- Keep all route handlers in `app/api/**/route.ts`.
- Keep Supabase access helpers in `lib/db.ts`.
- Keep Telegram formatting and send logic isolated in `lib/telegram.ts`.
- Keep flight search logic pure where possible so it can be reused by both API routes and cron jobs.

