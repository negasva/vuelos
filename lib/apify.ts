export type TrackedFlight = {
  id: string;
  user_id: string;
  origin: string;
  destination: string;
  baggage_type: "morral" | "mano_10kg" | "bodega_23kg";
  max_stops: number;
  visa_exclusion: boolean;
  night_only: boolean;
  flex_days: number;
  target_price: number;
  is_active: boolean;
};

export type ApifySearchQuery = {
  from: string;
  to: string;
  departure_date: string;
  return_date: string;
};

export type ApifyInput = {
  query: ApifySearchQuery[];
  currency: "COP";
  travel_class: "ECONOMY";
};

export type ApifyRouteLeg = {
  airline?: string;
  airline_name?: string;
  flight_no?: string | number;
  flyFrom?: string;
  flyTo?: string;
  origin?: string;
  destination?: string;
  local_departure?: string;
  local_arrival?: string;
  departure?: string;
  arrival?: string;
};

export type ApifyFlightItem = {
  price?: number;
  total_price?: number;
  currency?: string;
  airline?: string;
  airlines?: string[];
  deep_link?: string;
  link?: string;
  route?: ApifyRouteLeg[];
  bags_price?: Record<string, number>;
  baglimit?: {
    hand?: number;
    hold?: number;
  };
  departure_time?: string;
  departure?: string;
  arrival_time?: string;
  arrival?: string;
  travel_class?: string;
};

export type PriceHistoryRow = {
  flight_id: string;
  price: number;
  airline: string | null;
  departure_time: string | null;
  checked_at: string;
};

const APIFY_URL =
  process.env.APIFY_API_URL ??
  "https://api.apify.com/v2/acts/johnvc~google-flights-data-scraper/run-sync-get-dataset-items";

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeAirport(code: string): string {
  return code.trim().toUpperCase();
}

export function buildApifyInput(flight: TrackedFlight): ApifyInput {
  const baseDate = new Date();
  const flexDays = Math.max(0, Math.min(3, flight.flex_days ?? 0));
  const departure = new Date(baseDate);
  const returnDate = new Date(baseDate);

  departure.setDate(departure.getDate() + flexDays);
  returnDate.setDate(returnDate.getDate() + flexDays + 7);

  return {
    query: [
      {
        from: normalizeAirport(flight.origin),
        to: normalizeAirport(flight.destination),
        departure_date: toDate(departure),
        return_date: toDate(returnDate),
      },
    ],
    currency: "COP",
    travel_class: "ECONOMY",
  };
}

export async function fetchApifyFlights(input: ApifyInput): Promise<ApifyFlightItem[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error("Missing APIFY_API_TOKEN");
  }

  const url = `${APIFY_URL}?token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Apify API error ${response.status}: ${details.slice(0, 300)}`);
  }

  const json = await response.json();
  return Array.isArray(json) ? (json as ApifyFlightItem[]) : [];
}

export function getPrimaryDepartureTime(flight: ApifyFlightItem): string | null {
  const firstLeg = flight.route?.[0];
  return (
    firstLeg?.local_departure ??
    firstLeg?.departure ??
    flight.departure_time ??
    flight.departure ??
    null
  );
}

export function getBaggageSurcharge(
  flight: ApifyFlightItem,
  baggageType: TrackedFlight["baggage_type"]
): number {
  const hand = flight.baglimit?.hand ?? 0;
  const hold = flight.baglimit?.hold ?? 0;
  const bags = flight.bags_price ?? {};

  if (baggageType === "morral") return 0;
  if (baggageType === "mano_10kg") return hand > 10 ? Number(bags["1"] ?? 35000) : 0;
  if (baggageType === "bodega_23kg") return hold > 23 ? Number(bags["2"] ?? 90000) : 0;
  return 0;
}

export function isNightFlight(flight: ApifyFlightItem): boolean {
  const departure = getPrimaryDepartureTime(flight);
  if (!departure) return false;
  const hour = new Date(departure).getHours();
  return hour >= 23 || hour < 5;
}

export function violatesVisaFilter(flight: ApifyFlightItem): boolean {
  return (
    flight.route?.some((leg) => {
      const from = (leg.flyFrom ?? leg.origin ?? "").toUpperCase();
      const to = (leg.flyTo ?? leg.destination ?? "").toUpperCase();
      const airport = `${from} ${to}`;
      return airport.includes("US") || airport.includes("USA");
    }) ?? false
  );
}

export function mapFlightToHistoryRow(args: {
  trackedFlightId: string;
  flight: ApifyFlightItem;
  baggageType: TrackedFlight["baggage_type"];
}): PriceHistoryRow {
  const baggageSurcharge = getBaggageSurcharge(args.flight, args.baggageType);
  const basePrice = Number(args.flight.price ?? args.flight.total_price ?? 0);

  return {
    flight_id: args.trackedFlightId,
    price: basePrice + baggageSurcharge,
    airline: args.flight.airline ?? args.flight.airlines?.[0] ?? args.flight.route?.[0]?.airline ?? null,
    departure_time: getPrimaryDepartureTime(args.flight),
    checked_at: new Date().toISOString(),
  };
}

export function buildApifyInputForTrackedFlight(flight: TrackedFlight): ApifyInput {
  return buildApifyInput(flight);
}
