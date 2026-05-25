// Decks Bridge pairing endpoint.
// The Bridge app POSTs the 6-digit code shown in the DJ dashboard.
// We return the event_id, ingest_token and the edge function URL it should call.
// Pairing codes expire after 5 minutes and can only be claimed once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Light rate limiting: max N failed attempts per IP per window.
const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MINUTES = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Check recent failed attempts for this IP
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count: failedCount } = await supabase
    .from("bridge_pair_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("attempted_at", since);

  if ((failedCount ?? 0) >= MAX_FAILED_ATTEMPTS) {
    return json(
      { error: "Too many pairing attempts. Please wait a few minutes and try again." },
      429,
    );
  }

  const logAttempt = async (success: boolean) => {
    await supabase.from("bridge_pair_attempts").insert({ ip, success });
  };

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    await logAttempt(false);
    return json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { code } = parsed.data;

  const { data: row, error } = await supabase
    .from("bridge_pairing_codes")
    .select("id, event_id, expires_at, claimed_at")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("pairing lookup failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
  if (!row) return json({ error: "Invalid pairing code" }, 404);
  if (row.claimed_at) return json({ error: "Pairing code already used" }, 409);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return json({ error: "Pairing code expired" }, 410);
  }

  // Ensure integration row + token exist
  const { data: integ, error: integErr } = await supabase
    .from("event_integrations")
    .select("id, ingest_token")
    .eq("event_id", row.event_id)
    .maybeSingle();

  let ingestToken = integ?.ingest_token as string | undefined;
  if (integErr) {
    console.error("integration lookup failed:", integErr);
    return json({ error: "Internal server error" }, 500);
  }
  if (!integ) {
    const { data: created, error: cErr } = await supabase
      .from("event_integrations")
      .insert({ event_id: row.event_id, source_type: "bridge" })
      .select("ingest_token")
      .single();
    if (cErr || !created) {
      console.error("integration create failed:", cErr);
      return json({ error: "Internal server error" }, 500);
    }
    ingestToken = created.ingest_token as string;
  } else {
    await supabase
      .from("event_integrations")
      .update({ source_type: "bridge", updated_at: new Date().toISOString() })
      .eq("id", integ.id);
  }

  // Mark code as claimed
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await supabase
    .from("bridge_pairing_codes")
    .update({ claimed_at: new Date().toISOString(), claimed_ip: ip })
    .eq("id", row.id);

  return json({
    event_id: row.event_id,
    ingest_token: ingestToken,
    edge_function_url: `${SUPABASE_URL}/functions/v1/now-playing-ingest`,
  });
});
