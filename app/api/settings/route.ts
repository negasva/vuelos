import { NextResponse } from "next/server";
import { getOrCreateGuestUser, supabaseRest } from "@/lib/supabase-rest";

export async function GET() {
  try {
    const userId = await getOrCreateGuestUser();
    const response = await supabaseRest(
      `users?id=eq.${userId}&select=id,email,telegram_chat_id,notify_email`
    );
    if (!response.ok) throw new Error(`Supabase settings failed ${response.status}`);
    const rows = (await response.json()) as Array<{
      telegram_chat_id: string | null;
      notify_email: string | null;
    }>;
    return NextResponse.json({
      ok: true,
      telegram_chat_id: rows[0]?.telegram_chat_id ?? null,
      notify_email: rows[0]?.notify_email ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      telegram_chat_id?: string | null;
      notify_email?: string | null;
    };

    const updates: Record<string, string | null> = {};
    if ("telegram_chat_id" in body) {
      const raw = typeof body.telegram_chat_id === "string" ? body.telegram_chat_id.trim() : "";
      updates.telegram_chat_id = raw === "" ? null : raw;
    }
    if ("notify_email" in body) {
      const raw = typeof body.notify_email === "string" ? body.notify_email.trim() : "";
      updates.notify_email = raw === "" ? null : raw;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada que actualizar" }, { status: 400 });
    }

    const userId = await getOrCreateGuestUser();
    const response = await supabaseRest(`users?id=eq.${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Supabase update failed ${response.status}: ${details}`);
    }

    const rows = (await response.json()) as Array<{
      telegram_chat_id: string | null;
      notify_email: string | null;
    }>;
    return NextResponse.json({
      ok: true,
      telegram_chat_id: rows[0]?.telegram_chat_id ?? null,
      notify_email: rows[0]?.notify_email ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
