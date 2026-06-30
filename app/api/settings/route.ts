import { NextResponse } from "next/server";
import { getOrCreateGuestUser, supabaseRest } from "@/lib/supabase-rest";

export async function GET() {
  try {
    const userId = await getOrCreateGuestUser();
    const response = await supabaseRest(
      `users?id=eq.${userId}&select=id,email,telegram_chat_id`
    );
    if (!response.ok) throw new Error(`Supabase settings failed ${response.status}`);
    const rows = (await response.json()) as Array<{ telegram_chat_id: string | null }>;
    return NextResponse.json({
      ok: true,
      telegram_chat_id: rows[0]?.telegram_chat_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { telegram_chat_id?: string | null };
    const raw = typeof body.telegram_chat_id === "string" ? body.telegram_chat_id.trim() : "";
    const chatId = raw === "" ? null : raw;

    const userId = await getOrCreateGuestUser();
    const response = await supabaseRest(`users?id=eq.${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ telegram_chat_id: chatId }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase update failed ${response.status}: ${details}`);
    }

    const rows = (await response.json()) as Array<{ telegram_chat_id: string | null }>;
    return NextResponse.json({
      ok: true,
      telegram_chat_id: rows[0]?.telegram_chat_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
