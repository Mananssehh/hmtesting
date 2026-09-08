// Atomic, rate-limited join boundary for Decks events.
// Wraps public.join_event_by_code so we can rate limit by account AND by IP
// (Postgres cannot see the real client IP). Every failure returns the same
// generic answer so room codes cannot be enumerated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  code: z.string().trim().min(1).max(20),
  nickname: z.string().trim().max(24).optional(),
});

const ENDPOINT = "join-event";
const WINDOW_MINUTES = 10;
const MAX_PER_USER = 10;
const MAX_PER_IP = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DENIED = { ok: false, reason: "unavailable" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(DENIED, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate the JWT in code (verify_jwt = false on this function).
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return json(DENIED, 401);

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const [userCountRes, ipCountRes] = await Promise.all([
    admin
      .from("rate_limit_logs")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", ENDPOINT)
      .eq("user_id", userId)
      .gte("created_at", since),
    admin
      .from("rate_limit_logs")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", ENDPOINT)
      .eq("ip", ip)
      .gte("created_at", since),
  ]);

  if ((userCountRes.count ?? 0) >= MAX_PER_USER || (ipCountRes.count ?? 0) >= MAX_PER_IP) {
    return json({ ok: false, reason: "rate_limited" }, 429);
  }

  // Record the attempt before doing the lookup so bursts always count.
  await admin.from("rate_limit_logs").insert({ endpoint: ENDPOINT, user_id: userId, ip });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json(DENIED, 200);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await asUser.rpc("join_event_by_code", {
    _code: parsed.data.code,
    _nickname: parsed.data.nickname ?? null,
  });

  if (error) {
    console.error("join_event_by_code failed:", error.message);
    return json({ ok: false, reason: "error" }, 500);
  }

  return json(data ?? DENIED, 200);
});
