import {
  buildApifyInputForTrackedFlight,
  fetchApifyFlights,
  isNightFlight,
  mapFlightToHistoryRow,
  violatesVisaFilter,
  type ApifyFlightItem,
  type TrackedFlight,
} from "./apify";
import type { FlightAlert } from "./telegram";

export type PriceStats = { previous: number | null; average: number | null };

type Group = {
  key: string;
  flights: TrackedFlight[];
};

function groupKey(flight: TrackedFlight): string {
  return [
    flight.origin,
    flight.destination,
    flight.max_stops,
    flight.visa_exclusion,
    flight.night_only,
    flight.flex_days,
    flight.baggage_type,
  ].join(":");
}

export function groupTrackedFlights(flights: TrackedFlight[]): Group[] {
  const map = new Map<string, TrackedFlight[]>();
  for (const flight of flights) {
    const key = groupKey(flight);
    const current = map.get(key) ?? [];
    current.push(flight);
    map.set(key, current);
  }
  return [...map.entries()].map(([key, groupedFlights]) => ({ key, flights: groupedFlights }));
}

function passesFlightFilters(flight: ApifyFlightItem, tracked: TrackedFlight): boolean {
  if (tracked.night_only && !isNightFlight(flight)) return false;
  if (tracked.visa_exclusion && violatesVisaFilter(flight)) return false;
  return true;
}

function scoreFlight(flight: ApifyFlightItem, tracked: TrackedFlight): number {
  const bag = mapFlightToHistoryRow({ trackedFlightId: tracked.id, flight, baggageType: tracked.baggage_type });
  return bag.price;
}

export function detectErrorFare(currentPrice: number, historicalAverage: number | null): boolean {
  if (historicalAverage === null || historicalAverage <= 0) return false;
  return currentPrice <= historicalAverage * 0.3;
}

function shouldAlert(price: number, tracked: TrackedFlight): boolean {
  // The target price is a hard ceiling: never notify above it, even if the
  // fare dropped sharply or looks like an error fare. Users configure the
  // target as "notify me only below X", so a 3M price must never alert when
  // the target is 2M.
  return price <= tracked.target_price;
}

export async function runTrackedFlights(
  flights: TrackedFlight[],
  priceStats: Map<string, PriceStats> = new Map()
) {
  const groups = groupTrackedFlights(flights);
  const now = new Date().toISOString();
  const historyRows: Array<ReturnType<typeof mapFlightToHistoryRow>> = [];
  const alerts: FlightAlert[] = [];

  let totalResults = 0;
  const errors: string[] = [];

  for (const group of groups) {
    const seed = group.flights[0];

    try {
      const input = buildApifyInputForTrackedFlight(seed);
      const results = await fetchApifyFlights(input);
      totalResults += results.length;

      for (const tracked of group.flights) {
        const valid = results.filter((flight) => passesFlightFilters(flight, tracked));
        if (valid.length === 0) continue;

        const best = valid.reduce((min, flight) =>
          scoreFlight(flight, tracked) < scoreFlight(min, tracked) ? flight : min,
        valid[0]);

        const row = mapFlightToHistoryRow({
          trackedFlightId: tracked.id,
          flight: best,
          baggageType: tracked.baggage_type,
        });

        row.checked_at = now;
        historyRows.push(row);

        const stats = priceStats.get(tracked.id) ?? { previous: null, average: null };
        const errorFare = detectErrorFare(row.price, stats.average);

        if (shouldAlert(row.price, tracked)) {
          alerts.push({
            flightId: tracked.id,
            origin: tracked.origin,
            destination: tracked.destination,
            price: row.price,
            airline: row.airline,
            departureTime: row.departure_time,
            targetPrice: tracked.target_price,
            errorFare,
            telegramChatId: tracked.telegram_chat_id ?? null,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Apify error";
      errors.push(`${group.key}: ${message}`);
      console.error("[flight-tracker] Apify fetch failed", { groupKey: group.key, error });
    }
  }

  const diagnostics = {
    groups: groups.length,
    totalResults,
    groupErrors: errors.length,
    sampleError: errors[0] ?? null,
  };

  return { historyRows, alerts, diagnostics };
}

