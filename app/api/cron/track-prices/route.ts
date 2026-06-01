import { NextResponse } from "next/server";
import { runTrackedFlights } from "@/lib/flight-tracker";

type CronResult = {
  ok: boolean;
  groupsProcessed?: number;
  alertsSent?: number;
  error?: string;
};

type SupabaseTrackedFlight = {
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

async function getSupabaseFlights(): Promise<SupabaseTrackedFlight[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration");

  const response = await fetch(`${url}/rest/v1/tracked_flights?is_active=eq.true`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase error ${response.status}`);
  }

  return response.json();
}

async function insertPriceHistory(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/rest/v1/price_history`, {
    method: "POST",
    headers: {
      apikey: key ?? "",
      Authorization: `Bearer ${key ?? ""}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Supabase insert error ${response.status}`);
}

async function logCronError(message: string, details: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/flight_tracking_logs`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        level: "error",
        message,
        details,
        created_at: new Date().toISOString(),
      }),
    });
  } catch {
    console.error("[flight-tracker] failed to write log to Supabase");
  }
}

export async function GET(request: Request): Promise<NextResponse<CronResult>> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeFlights = await getSupabaseFlights();
    const { historyRows, alerts } = await runTrackedFlights(activeFlights);

    await insertPriceHistory(historyRows);

    return NextResponse.json({
      ok: true,
      groupsProcessed: activeFlights.length,
      alertsSent: alerts.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron failure";
    await logCronError("track-prices cron failed", message);
    console.error("[flight-tracker] cron failed", error);

    return NextResponse.json(
      { ok: false, error: "Cron execution failed" },
      { status: 500 }
    );
  }
}

