import { NextResponse } from "next/server";

type CreateTrackedFlightBody = {
  origin?: string;
  destination?: string;
  baggage_type?: "any" | "morral" | "mano_10kg" | "bodega_23kg";
  max_stops?: number;
  visa_exclusion?: boolean;
  night_only?: boolean;
  flex_days?: number;
  target_price?: number;
};

async function getSupabaseUrlAndKey() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration");
  return { url, key };
}

async function getOrCreateGuestUser(url: string, key: string) {
  const guestEmail = "guest@flighttracker.local";
  const lookup = await fetch(`${url}/rest/v1/users?email=eq.${encodeURIComponent(guestEmail)}&select=id,email`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!lookup.ok) {
    throw new Error(`Supabase user lookup failed ${lookup.status}`);
  }

  const users = (await lookup.json()) as Array<{ id: string }>;
  if (users.length > 0) return users[0].id;

  const create = await fetch(`${url}/rest/v1/users`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([{ email: guestEmail }]),
  });

  if (!create.ok) {
    throw new Error(`Supabase user create failed ${create.status}`);
  }

  const created = (await create.json()) as Array<{ id: string }>;
  if (!created[0]?.id) throw new Error("Could not create guest user");
  return created[0].id;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTrackedFlightBody;
    const origin = body.origin?.trim().toUpperCase();
    const destination = body.destination?.trim().toUpperCase();
    const targetPrice = Number(body.target_price ?? 0);

    if (!origin || !destination || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid flight alert payload" },
        { status: 400 },
      );
    }

    const { url, key } = await getSupabaseUrlAndKey();
    const userId = await getOrCreateGuestUser(url, key);

    const response = await fetch(`${url}/rest/v1/tracked_flights`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          user_id: userId,
          origin,
          destination,
          baggage_type: body.baggage_type ?? "any",
          max_stops: Number.isFinite(body.max_stops as number) ? Number(body.max_stops) : 0,
          visa_exclusion: Boolean(body.visa_exclusion),
          night_only: Boolean(body.night_only),
          flex_days: Number.isFinite(body.flex_days as number) ? Number(body.flex_days) : 0,
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
    const { url, key } = await getSupabaseUrlAndKey();
    const response = await fetch(
      `${url}/rest/v1/tracked_flights?select=id,origin,destination,baggage_type,max_stops,visa_exclusion,night_only,flex_days,target_price,is_active,created_at&order=created_at.desc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
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
    const body = (await request.json()) as { id?: string; target_price?: number; is_active?: boolean };
    if (!body.id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { url, key } = await getSupabaseUrlAndKey();
    const updates: Record<string, unknown> = {};
    if (typeof body.target_price === "number") updates.target_price = body.target_price;
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    const response = await fetch(`${url}/rest/v1/tracked_flights?id=eq.${encodeURIComponent(body.id)}`, {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    });

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
    const urlObj = new URL(request.url);
    const id = urlObj.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { url, key } = await getSupabaseUrlAndKey();
    const response = await fetch(`${url}/rest/v1/tracked_flights?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
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
