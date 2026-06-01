# FlightTracker Co - Step 4 Frontend UI Spec

This step defines the dashboard experience for tracking flight prices in Colombia.

## Primary layout

The dashboard should use a three-panel layout on desktop and a stacked layout on mobile:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: brand, route search, quick actions                   │
├───────────────────────┬───────────────────────┬──────────────┤
│ Search + Filters      │ Active Alerts         │ Price History │
│ form                  │ list                  │ chart + badge  │
└───────────────────────┴───────────────────────┴──────────────┘
```

## Visual direction

- Use a premium travel feel with deep navy, teal, and warm accent colors.
- Keep typography crisp and highly scannable.
- Prefer dense but breathable cards with clear hierarchy.
- Use subtle gradients and soft borders rather than flat white panels.

## Core sections

### 1. Search and alert form

Inputs and controls:

- Origin airport autocomplete
- Destination airport autocomplete
- Stop selector: with stops / nonstop
- Visa exclusion switch
- Baggage type selector
- Night-only switch
- Flexible date matrix with +/- 3 days
- Target price input
- Submit button: register alert

Behavior:

- Show inline helper text for visa and baggage filters.
- Disable submit until origin, destination, and target price are valid.
- Surface a compact summary chip row before submit.

### 2. Active alerts panel

Each alert row should show:

- Route
- Price target
- Current status
- Pause button
- Delete button

Behavior:

- Support pause/resume without removing history.
- Use color-coded status pills: active, paused, triggered.

### 3. Price history panel

This section should contain:

- A simple line chart for price over time
- A badge indicating the buy recommendation
- A short explanatory note

Badge logic:

- `COMPRA YA` when the route is at or near its historical low
- `ESPERA` when recent trends indicate more drops are likely

## Mobile behavior

- Stack sections vertically.
- Keep the submit button fixed near the bottom only if it does not block content.
- Collapse dense filters into expandable groups on small screens.

