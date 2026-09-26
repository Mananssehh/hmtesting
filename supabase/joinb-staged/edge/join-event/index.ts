// Atomic, rate-limited join boundary for Decks events.
// Calls public.join_event_by_code_trusted as service_role with the guest id
// verified here via auth.getUser(token). The old join_event_by_code(text,text)
// is no longer called. Every failure returns the same generic 200 answer so
// room codes cannot be enumerated (401/405/429/500 differ, as before).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { createHandler } from "./handler.ts";

const ENDPOINT = "join-event";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createHandler({
    // Validate the JWT in code (verify_jwt = false on this function).
    async getUserId(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data?.user?.id ?? null;
    },
    async countAttempts(by, value, sinceIso) {
      const { count } = await admin
        .from("rate_limit_logs")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", ENDPOINT)
        .eq(by === "user" ? "user_id" : "ip", value)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },
    async recordAttempt(userId, ip) {
      await admin.from("rate_limit_logs").insert({ endpoint: ENDPOINT, user_id: userId, ip });
    },
    async joinTrusted(userId, code, nickname) {
      const { data, error } = await admin.rpc("join_event_by_code_trusted", {
        _user_id: userId,
        _code: code,
        _nickname: nickname,
      });
      return { data, error };
    },
    log: (line) => console.log(line),
    now: () => Date.now(),
  }),
);
