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

export type KiwiSearchParams = {
  fly_from: string;
  to: string;
  date_from: string;
  date_to: string;
  curr: "COP";
  sort?: "price";
  max_stopovers?: number;
  select_airlines_exclude?: string;
};

export type KiwiFlight = {
  price: number;
  airline: string;
  deep_link?: string;
  route: Array<{
    airline: string;
    flyFrom: string;
    flyTo: string;
    cityFrom?: string;
    cityTo?: string;
    local_departure: string;
    local_arrival?: string;
  }>;
  bags_price?: {
    1?: number;
    2?: number;
  };
  baglimit?: {
    hand?: number;
    hold?: number;
  };
  fly_duration?: string;
  booking_token?: string;
  timestamp?: number;
};

export type PriceHistoryRow = {
  flight_id: string;
  price: number;
  airline: string | null;
  departure_time: string | null;
  checked_at: string;
};

const KIWI_URL = process.env.KIWI_API_URL ?? "https://api.tequila.kiwi.com/v2/search";

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildKiwiParams(flight: TrackedFlight): KiwiSearchParams {
  const today = new Date();
  const flexDays = Math.max(0, Math.min(3, flight.flex_days ?? 0));
  const dateFrom = new Date(today);
  const dateTo = new Date(today);
  dateFrom.setDate(dateFrom.getDate() + flexDays);
  dateTo.setDate(dateTo.getDate() + flexDays);

  return {
    fly_from: flight.origin,
    to: flight.destination,
    date_from: toDate(dateFrom),
    date_to: toDate(dateTo),
    curr: "COP",
    sort: "price",
    max_stopovers: flight.max_stops,
  };
}

function encodeQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export async function fetchKiwiFlights(params: KiwiSearchParams): Promise<KiwiFlight[]> {
  const apiKey = process.env.KIWI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing KIWI_API_KEY");
  }

  const url = `${KIWI_URL}?${encodeQuery(params)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      apikey: apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Kiwi API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  return Array.isArray(json?.data) ? (json.data as KiwiFlight[]) : [];
}

export function getPrimaryDepartureTime(flight: KiwiFlight): string | null {
  const firstLeg = flight.route?.[0];
  return firstLeg?.local_departure ?? null;
}

export function getBaggageSurcharge(flight: KiwiFlight, baggageType: TrackedFlight["baggage_type"]): number {
  const hand = flight.baglimit?.hand ?? 0;
  const hold = flight.baglimit?.hold ?? 0;

  if (baggageType === "morral") return 0;
  if (baggageType === "mano_10kg") return hand > 10 ? 35000 : 0;
  if (baggageType === "bodega_23kg") return hold > 23 ? 90000 : 0;
  return 0;
}

export function isNightFlight(flight: KiwiFlight): boolean {
  const departure = flight.route?.[0]?.local_departure;
  if (!departure) return false;
  const hour = new Date(departure).getHours();
  return hour >= 23 || hour < 5;
}

export function violatesVisaFilter(flight: KiwiFlight): boolean {
  return flight.route?.some((leg) => {
    const airport = `${leg.flyFrom} ${leg.flyTo}`.toUpperCase();
    return airport.includes("US") || airport.includes("USA");
  }) ?? false;
}

export function mapFlightToHistoryRow(args: {
  trackedFlightId: string;
  flight: KiwiFlight;
  baggageType: TrackedFlight["baggage_type"];
}): PriceHistoryRow {
  const baggageSurcharge = getBaggageSurcharge(args.flight, args.baggageType);
  return {
    flight_id: args.trackedFlightId,
    price: Number(args.flight.price ?? 0) + baggageSurcharge,
    airline: args.flight.airline ?? args.flight.route?.[0]?.airline ?? null,
    departure_time: getPrimaryDepartureTime(args.flight),
    checked_at: new Date().toISOString(),
  };
}

