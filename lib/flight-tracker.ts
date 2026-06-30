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

function shouldAlert(
  price: number,
  tracked: TrackedFlight,
  stats: PriceStats,
  errorFare: boolean
): boolean {
  if (price <= tracked.target_price) return true;
  if (stats.previous !== null && stats.previous > 0 && price <= stats.previous * 0.8) {
    return true;
  }
  return errorFare;
}

export async function runTrackedFlights(
  flights: TrackedFlight[],
  priceStats: Map<string, PriceStats> = new Map()
) {
  const groups = groupTrackedFlights(flights);
  const now = new Date().toISOString();
  const historyRows: Array<ReturnType<typeof mapFlightToHistoryRow>> = [];
  const alerts: FlightAlert[] = [];

  for (const group of groups) {
    const seed = group.flights[0];

    try {
      const input = buildApifyInputForTrackedFlight(seed);
      const results = await fetchApifyFlights(input);

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

        if (shouldAlert(row.price, tracked, stats, errorFare)) {
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
      console.error("[flight-tracker] Apify fetch failed", { groupKey: group.key, error });
    }
  }

  return { historyRows, alerts };
}

