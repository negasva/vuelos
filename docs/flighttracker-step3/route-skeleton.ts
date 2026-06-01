import { NextResponse } from "next/server";

type CronResult = {
  ok: boolean;
  groupsProcessed?: number;
  alertsSent?: number;
  error?: string;
};

function unauthorized(): NextResponse<CronResult> {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 }
  );
}

export async function GET(request: Request): Promise<NextResponse<CronResult>> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return unauthorized();
  }

  // Placeholder flow for Step 3:
  // 1. Load tracked_flights from Supabase
  // 2. Group by normalized search key
  // 3. Query Amadeus/Kiwi once per group
  // 4. Compare fares and detect anomalies
  // 5. Persist price_history rows
  // 6. Send Telegram notifications for qualified alerts

  return NextResponse.json({
    ok: true,
    groupsProcessed: 0,
    alertsSent: 0,
  });
}

