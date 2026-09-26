// Request handling for join-event, separated from client wiring so it can be
// tested with mocked dependencies. The verified guest id comes ONLY from
// getUser(token); it is never read from the request body.
import { z } from "https://esm.sh/zod@3.23.8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// .strict(): any extra field (e.g. user_id) is rejected.
export const BodySchema = z
  .object({
    code: z.string().trim().min(1).max(20),
    nickname: z.string().trim().max(24).optional(),
  })
  .strict();

export const WINDOW_MINUTES = 10;
export const MAX_PER_USER = 10;
export const MAX_PER_IP = 30;

export const DENIED = { ok: false, reason: "unavailable" };

export interface JoinDeps {
  getUserId(token: string): Promise<string | null>;
  countAttempts(by: "user" | "ip", value: string, sinceIso: string): Promise<number>;
  recordAttempt(userId: string, ip: string): Promise<void>;
  joinTrusted(
    userId: string,
    code: string,
    nickname: string | null,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  log(line: string): void;
  now(): number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createHandler(deps: JoinDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(DENIED, 401);

    const userId = await deps.getUserId(token).catch(() => null);
    if (!userId) return json(DENIED, 401);

    // KNOWN OPEN DEFECTS (unchanged by this work): every attempt, including
    // successful joins/refreshes, counts; the per-IP limit is shared by a venue
    // NAT; x-forwarded-for is trusted as given; count-then-insert is not atomic.
    const since = new Date(deps.now() - WINDOW_MINUTES * 60_000).toISOString();
    const [userCount, ipCount] = await Promise.all([
      deps.countAttempts("user", userId, since),
      deps.countAttempts("ip", ip, since),
    ]);
    if (userCount >= MAX_PER_USER || ipCount >= MAX_PER_IP) {
      return json({ ok: false, reason: "rate_limited" }, 429);
    }

    await deps.recordAttempt(userId, ip);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(DENIED, 200);

    const { data, error } = await deps.joinTrusted(
      userId,
      parsed.data.code,
      parsed.data.nickname ?? null,
    );
    deps.log("join_path=trusted");

    if (error) {
      console.error("join_event_by_code_trusted failed");
      return json({ ok: false, reason: "error" }, 500);
    }
    return json(data ?? DENIED, 200);
  };
}
