import { NextResponse } from "next/server";
import { getOrCreateGuestUser, supabaseRest } from "@/lib/supabase-rest";

type BaggageType = "any" | "morral" | "mano_10kg" | "bodega_23kg";

type TripType = "one_way" | "round_trip";

type CreateTrackedFlightBody = {
  origin?: string;
  destination?: string;
  baggage_type?: BaggageType;
  max_stops?: number;
  visa_exclusion?: boolean;
  night_only?: boolean;
  flex_days?: number;
  trip_type?: TripType;
  trip_length_days?: number;
  target_price?: number;
};

const SELECT_FIELDS =
  "id,origin,destination,baggage_type,max_stops,visa_exclusion,night_only,flex_days,trip_type,trip_length_days,target_price,is_active,created_at";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTrackedFlightBody;
    const origin = body.origin?.trim().toUpperCase();
    const destination = body.destination?.trim().toUpperCase();
    const targetPrice = Number(body.target_price ?? 0);

    if (!origin || !destination || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json(
        { ok: false, error: "Datos de alerta inválidos" },
        { status: 400 }
      );
    }
    if (origin === destination) {
      return NextResponse.json(
        { ok: false, error: "El origen y el destino no pueden ser iguales" },
        { status: 400 }
      );
    }

    const userId = await getOrCreateGuestUser();

    const response = await supabaseRest("tracked_flights", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify([
        {
          user_id: userId,
          origin,
          destination,
          baggage_type: body.baggage_type ?? "any",
          max_stops: Number.isFinite(body.max_stops as number) ? Number(body.max_stops) : 0,
          visa_exclusion: Boolean(body.visa_exclusion),
          night_only: Boolean(body.night_only),
          flex_days: clampFlexDays(body.flex_days),
          trip_type: body.trip_type === "round_trip" ? "round_trip" : "one_way",
          trip_length_days: clampTripLength(body.trip_length_days),
          target_price: targetPrice,
          is_active: true,
        },
      ]),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase insert failed ${response.status}: ${details}`);
    }

    const created = await response.json();
    return NextResponse.json({ ok: true, trackedFlight: created[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const userId = await getOrCreateGuestUser();
    const response = await supabaseRest(
      `tracked_flights?user_id=eq.${userId}&select=${SELECT_FIELDS}&order=created_at.desc`
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase list failed ${response.status}: ${details}`);
    }

    const rows = await response.json();
    return NextResponse.json({ ok: true, trackedFlights: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateTrackedFlightBody> & {
      id?: string;
      is_active?: boolean;
    };
    if (!body.id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.target_price === "number" && body.target_price > 0) {
      updates.target_price = body.target_price;
    }
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
    if (typeof body.baggage_type === "string") updates.baggage_type = body.baggage_type;
    if (typeof body.max_stops === "number") updates.max_stops = body.max_stops;
    if (typeof body.visa_exclusion === "boolean") updates.visa_exclusion = body.visa_exclusion;
    if (typeof body.night_only === "boolean") updates.night_only = body.night_only;
    if (typeof body.flex_days === "number") updates.flex_days = clampFlexDays(body.flex_days);
    if (body.trip_type === "one_way" || body.trip_type === "round_trip") {
      updates.trip_type = body.trip_type;
    }
    if (typeof body.trip_length_days === "number") {
      updates.trip_length_days = clampTripLength(body.trip_length_days);
    }
    if (typeof body.origin === "string") updates.origin = body.origin.trim().toUpperCase();
    if (typeof body.destination === "string") {
      updates.destination = body.destination.trim().toUpperCase();
    }

    if (
      typeof updates.origin === "string" &&
      typeof updates.destination === "string" &&
      updates.origin === updates.destination
    ) {
      return NextResponse.json(
        { ok: false, error: "El origen y el destino no pueden ser iguales" },
        { status: 400 }
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada que actualizar" }, { status: 400 });
    }

    const response = await supabaseRest(
      `tracked_flights?id=eq.${encodeURIComponent(body.id)}&select=${SELECT_FIELDS}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase update failed ${response.status}: ${details}`);
    }

    const rows = await response.json();
    return NextResponse.json({ ok: true, trackedFlight: rows[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const response = await supabaseRest(`tracked_flights?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase delete failed ${response.status}: ${details}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function clampFlexDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

function clampTripLength(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(60, Math.round(n)));
}
