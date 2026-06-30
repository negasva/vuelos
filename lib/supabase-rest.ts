export const GUEST_EMAIL = "guest@flighttracker.local";

type SupabaseConfig = { url: string; key: string };

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return { url, key };
}

/** Thin wrapper around Supabase's PostgREST endpoint with auth headers attached. */
export async function supabaseRest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = getSupabaseConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** This app has no auth yet, so all data hangs off a single shared guest user. */
export async function getOrCreateGuestUser(): Promise<string> {
  const lookup = await supabaseRest(
    `users?email=eq.${encodeURIComponent(GUEST_EMAIL)}&select=id`
  );
  if (!lookup.ok) throw new Error(`Supabase user lookup failed ${lookup.status}`);
  const users = (await lookup.json()) as Array<{ id: string }>;
  if (users.length > 0) return users[0].id;

  const create = await supabaseRest("users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify([{ email: GUEST_EMAIL }]),
  });
  if (!create.ok) throw new Error(`Supabase user create failed ${create.status}`);
  const created = (await create.json()) as Array<{ id: string }>;
  if (!created[0]?.id) throw new Error("Could not create guest user");
  return created[0].id;
}
