# FlightTracker Co - Step 4 Component Blueprint

This file outlines the React component breakdown for the dashboard.

## Suggested file structure

```text
app/
├── page.tsx
└── dashboard/
    └── page.tsx

components/
├── dashboard/
│   ├── search-form.tsx
│   ├── active-alerts.tsx
│   ├── price-history-chart.tsx
│   └── recommendation-badge.tsx
└── ui/
    ├── badge.tsx
    ├── button.tsx
    ├── card.tsx
    ├── input.tsx
    ├── select.tsx
    └── switch.tsx
```

## Component responsibilities

### `search-form.tsx`

- Collect search criteria and alert thresholds.
- Own all filter state for baggage, visa exclusion, stops, and time preference.
- Expose a submit event payload shaped for the backend.

Recommended payload shape:

```ts
type FlightAlertPayload = {
  origin: string;
  destination: string;
  maxStops: number;
  visaExclusion: boolean;
  nightOnly: boolean;
  baggageType: "morral" | "mano_10kg" | "bodega_23kg";
  flexDays: number;
  targetPrice: number;
};
```

### `active-alerts.tsx`

- Render active tracked routes.
- Offer pause and delete actions.
- Show the latest detected price next to the target.

### `price-history-chart.tsx`

- Render a simple line chart.
- Display the recommendation badge.
- Provide a small caption summarizing the trend.

### `recommendation-badge.tsx`

- Encapsulate the buy/wait logic display.
- Support variants such as `buy`, `wait`, and `error-fare`.

## UI state model

Recommended view states:

- `idle`
- `loading`
- `empty`
- `success`
- `error`

## Data contracts

Dashboard data should be normalized into three sections:

```ts
type DashboardData = {
  activeAlerts: FlightAlertPayload[];
  priceHistory: Array<{ checkedAt: string; price: number }>;
  recommendation: "COMPRA_YA" | "ESPERA" | "POSSIBLE_ERROR_FARE";
};
```

