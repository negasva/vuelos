# FlightTracker Co - Step 3 Algorithm Details

## 1. Search grouping

The system should generate a stable group key from the inputs that affect pricing.

Recommended key fields:

- `origin`
- `destination`
- `departure_date`
- `return_date` if applicable
- `max_stops`
- `visa_exclusion`
- `night_only`
- `flex_days`
- `baggage_type`

Example normalized key:

```text
BOG:MDE:2026-07-10:none:0:true:false:3:mano_10kg
```

## 2. Deduplication strategy

Flights are considered identical for API usage when the normalized key matches exactly.

Recommended in-memory structure:

```ts
Map<string, TrackedFlight[]>
```

This lets the backend:

- Perform one provider call per key.
- Reuse the result for all matching subscriptions.
- Keep the alert logic per-user after the shared search returns.

## 3. Route comparison logic

For each group, compare three possibilities:

- Traditional round trip from the same airline or itinerary.
- Mixed round trip, where outbound and return legs may differ.
- Filtered result after baggage and visa constraints are applied.

The cheapest valid option should be recorded as the recommended option.

## 4. Error fare detection

Treat a result as a possible error fare when the current price drops dramatically relative to history.

Suggested rule:

- If `current_price <= historical_average * 0.30`, flag it.

Additional heuristics:

- Very low absolute fare for the route.
- Sudden multi-airline mismatch.
- Departure window that still appears bookable.

The response should be labeled as:

```text
POSSIBLE_ERROR_FARE
```

## 5. Alert triggers

Send Telegram alerts when:

- `current_price <= target_price`
- `current_price <= previous_price * 0.80`
- `fare_anomaly === true`

For emergency alerts, bypass non-critical filters and message immediately.

