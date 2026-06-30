import { NextResponse } from "next/server";
import { runTrackedFlights, type PriceStats } from "@/lib/flight-tracker";
import { dispatchAlerts } from "@/lib/telegram";
import type { TrackedFlight } from "@/lib/apify";

type CronResult = {
  ok: boolean;
  groupsProcessed?: number;
  apifyResults?: number;
  apifyErrors?: number;
  sampleError?: string | null;
  telegramConfigured?: boolean;
  alertsTriggered?: number;
  alertsSent?: number;
  error?: string;
};

async function getTelegramChatIds(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (userIds.length === 0) return map;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return map;

  const idList = [...new Set(userIds)].map((id) => `"${id}"`).join(",");
  // Tolerant: a failure here just means we fall back to TELEGRAM_DEFAULT_CHAT_ID.
  try {
    const response = await fetch(
      `${url}/rest/v1/users?id=in.(${idList})&select=id,telegram_chat_id`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!response.ok) return map;
    const rows = (await response.json()) as Array<{ id: string; telegram_chat_id: string | null }>;
    for (const row of rows) map.set(row.id, row.telegram_chat_id ?? null);
  } catch {
    return map;
  }
  return map;
}

async function getSupabaseFlights(): Promise<TrackedFlight[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");

  const response = await fetch(
    `${url}/rest/v1/tracked_flights?is_active=eq.true&select=*`,
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
    throw new Error(`Supabase tracked_flights error ${response.status}: ${details.slice(0, 300)}`);
  }

  const rows = (await response.json()) as TrackedFlight[];
  const chatIds = await getTelegramChatIds(rows.map((row) => row.user_id));
  return rows.map((row) => ({
    ...row,
    telegram_chat_id: row.telegram_chat_id ?? chatIds.get(row.user_id) ?? null,
  }));
}

async function getRecentPriceStats(flightIds: string[]): Promise<Map<string, PriceStats>> {
  const stats = new Map<string, PriceStats>();
  if (flightIds.length === 0) return stats;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return stats;

  const idList = flightIds.map((id) => `"${id}"`).join(",");
  const response = await fetch(
    `${url}/rest/v1/price_history?flight_id=in.(${idList})&select=flight_id,price&order=checked_at.desc`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) return stats;

  const rows = (await response.json()) as Array<{ flight_id: string; price: number }>;
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const list = grouped.get(row.flight_id) ?? [];
    list.push(Number(row.price));
    grouped.set(row.flight_id, list);
  }

  for (const [flightId, prices] of grouped) {
    // Rows are ordered newest-first, so prices[0] is the last recorded price.
    const previous = prices[0] ?? null;
    const average = prices.length
      ? prices.reduce((sum, value) => sum + value, 0) / prices.length
      : null;
    stats.set(flightId, { previous, average });
  }

  return stats;
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
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Supabase price_history insert error ${response.status}: ${details.slice(0, 300)}`);
  }
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
    const priceStats = await getRecentPriceStats(activeFlights.map((flight) => flight.id));
    const { historyRows, alerts, diagnostics } = await runTrackedFlights(
      activeFlights,
      priceStats
    );

    await insertPriceHistory(historyRows);
    const alertsSent = await dispatchAlerts(alerts);

    return NextResponse.json({
      ok: true,
      groupsProcessed: activeFlights.length,
      apifyResults: diagnostics.totalResults,
      apifyErrors: diagnostics.groupErrors,
      sampleError: diagnostics.sampleError,
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      alertsTriggered: alerts.length,
      alertsSent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron failure";
    await logCronError("track-prices cron failed", message);
    console.error("[flight-tracker] cron failed", error);

    // This endpoint is protected by CRON_SECRET, so surfacing the real cause to
    // the (authenticated) caller is safe and makes the GitHub Action log useful.
    return NextResponse.json(
      { ok: false, error: `Cron execution failed: ${message}` },
      { status: 500 }
    );
  }
}

