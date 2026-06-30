import { NextResponse } from "next/server";
import { getOrCreateGuestUser, supabaseRest } from "@/lib/supabase-rest";

type PriceHistoryPoint = {
  flightId: string;
  price: number;
  airline: string | null;
  departureTime: string | null;
  checkedAt: string;
};

export async function GET(request: Request) {
  try {
    const flightId = new URL(request.url).searchParams.get("flightId");

    let ids: string[];
    if (flightId) {
      ids = [flightId];
    } else {
      const userId = await getOrCreateGuestUser();
      const flightsRes = await supabaseRest(
        `tracked_flights?user_id=eq.${userId}&select=id`
      );
      if (!flightsRes.ok) throw new Error(`Supabase flights failed ${flightsRes.status}`);
      const flights = (await flightsRes.json()) as Array<{ id: string }>;
      ids = flights.map((flight) => flight.id);
    }

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, history: [] as PriceHistoryPoint[] });
    }

    const idList = ids.map((id) => `"${id}"`).join(",");
    const response = await supabaseRest(
      `price_history?flight_id=in.(${idList})&select=flight_id,price,airline,departure_time,checked_at&order=checked_at.asc&limit=2000`
    );
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase price_history failed ${response.status}: ${details}`);
    }

    const rows = (await response.json()) as Array<{
      flight_id: string;
      price: number;
      airline: string | null;
      departure_time: string | null;
      checked_at: string;
    }>;

    const history: PriceHistoryPoint[] = rows.map((row) => ({
      flightId: row.flight_id,
      price: Number(row.price),
      airline: row.airline,
      departureTime: row.departure_time,
      checkedAt: row.checked_at,
    }));

    return NextResponse.json({ ok: true, history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
