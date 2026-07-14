// Bridge read-only snapshot endpoint.
// Decks Bridge (desktop) authenticates via the per-event ingest_token issued
// during pairing (`bridge-pair`). We resolve the token -> event and return a
// scoped snapshot: event meta, now playing, queue, trending, tips, bridge status.
//
// Auth model:
//   Header: `Authorization: Bearer <ingest_token>`   (preferred)
//   or body:  { "ingest_token": "..." }
//
// The token lives in public.event_integrations.ingest_token and is unique per
// event. Rotating it (regenerate_ingest_token RPC) invalidates Bridge access.
//
// This function runs with service-role internally so it can bypass RLS *only*
// after the token proves ownership of exactly one event. It NEVER accepts an
// arbitrary event_id from the caller — the token is the sole authority.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractToken(req: Request, body: Record<string, unknown> | null): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const t = body && typeof body["ingest_token"] === "string" ? (body["ingest_token"] as string) : null;
  return t?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Record<string, unknown> | null = null;
  if (req.method === "POST") {
    body = await req.json().catch(() => ({})) as Record<string, unknown>;
  }
  const token = extractToken(req, body);
  if (!token || token.length < 16 || token.length > 128) {
    return json({ error: "Missing or malformed ingest token" }, 401);
  }

  // Resolve token -> integration -> event
  const { data: integ, error: integErr } = await supabase
    .from("event_integrations")
    .select("id, event_id, source_type, last_seen_at, updated_at")
    .eq("ingest_token", token)
    .maybeSingle();

  if (integErr) {
    console.error("integration lookup failed:", integErr);
    return json({ error: "Internal server error" }, 500);
  }
  if (!integ) return json({ error: "Invalid pairing token" }, 401);

  const eventId = integ.event_id as string;

  // Touch last_seen (fire-and-forget)
  supabase
    .from("event_integrations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", integ.id)
    .then(() => {}, () => {});

  // Load event, now_playing, queue, tips, participants concurrently
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sinceOnline = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const sinceTrend = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [
    eventRes,
    npRes,
    queueRes,
    tipsRes,
    onlineRes,
    tipTotalsRes,
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, venue, dj_id, dj_name, room_code, is_active, requests_status, created_at, ended_at")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("now_playing")
      .select("title, artist, album_art, apple_url, spotify_url, source, status, started_at, updated_at, now_playing_request_id")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("song_requests")
      .select("id, source_song_id, title, artist, album_art, upvotes, downvotes, boost, status, queue_position, created_at, requested_by")
      .eq("event_id", eventId)
      .in("status", ["pending", "approved", "playing"])
      .order("queue_position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("dj_tips")
      .select("gross_amount_cents, net_amount_cents, currency, status, song_title, artist, guest_nickname, song_request_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("event_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .gte("last_seen_at", sinceOnline),
    supabase
      .from("dj_tips")
      .select("gross_amount_cents, net_amount_cents, status, song_request_id")
      .eq("event_id", eventId)
      .gte("created_at", since24h),
  ]);

  if (eventRes.error || !eventRes.data) {
    return json({ error: "Event not found for token" }, 404);
  }
  const ev = eventRes.data;

  // Aggregate tip totals per song_request_id (succeeded only)
  const tipBySong = new Map<string, number>();
  let totalTipsCents = 0;
  let pendingTipsCents = 0;
  for (const t of tipTotalsRes.data ?? []) {
    if (t.status === "succeeded") {
      totalTipsCents += t.gross_amount_cents ?? 0;
      if (t.song_request_id) {
        tipBySong.set(t.song_request_id, (tipBySong.get(t.song_request_id) ?? 0) + (t.gross_amount_cents ?? 0));
      }
    } else if (t.status === "pending") {
      pendingTipsCents += t.gross_amount_cents ?? 0;
    }
  }

  // Recent vote velocity: votes in last 30m per song_request_id
  const requestIds = (queueRes.data ?? []).map((r) => r.id);
  const velocity = new Map<string, number>();
  if (requestIds.length) {
    const { data: recentVotes } = await supabase
      .from("votes")
      .select("song_request_id, value")
      .in("song_request_id", requestIds)
      .gte("created_at", sinceTrend);
    for (const v of recentVotes ?? []) {
      velocity.set(v.song_request_id, (velocity.get(v.song_request_id) ?? 0) + (v.value ?? 0));
    }
  }

  const queue = (queueRes.data ?? []).map((r, i) => {
    const votes = (r.upvotes ?? 0) - (r.downvotes ?? 0);
    return {
      request_id: r.id,
      song_id: r.source_song_id,
      title: r.title,
      artist: r.artist,
      artwork: r.album_art,
      vote_count: votes,
      request_count: 1, // one row = one request in current schema
      tip_total_cents: tipBySong.get(r.id) ?? 0,
      queue_position: r.queue_position ?? i + 1,
      request_status: r.status,
      created_at: r.created_at,
    };
  });

  // Trending score: votes + 2*velocity + tip_dollars
  const trending = [...queue]
    .map((q) => ({
      ...q,
      _score: q.vote_count + 2 * (velocity.get(q.request_id) ?? 0) + (q.tip_total_cents / 100),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...rest }) => rest);

  const recentTips = (tipsRes.data ?? []).slice(0, 20).map((t) => ({
    amount_cents: t.gross_amount_cents,
    net_amount_cents: t.net_amount_cents,
    currency: t.currency,
    song_title: t.song_title,
    artist: t.artist,
    guest_nickname: t.guest_nickname,
    created_at: t.created_at,
    payment_status: t.status,
  }));

  const createdAt = new Date(ev.created_at).getTime();
  const endedAt = ev.ended_at ? new Date(ev.ended_at).getTime() : Date.now();
  const durationSec = Math.max(0, Math.floor((endedAt - createdAt) / 1000));

  const status = ev.requests_status ?? (ev.is_active ? "active" : "ended");

  return json({
    event: {
      id: ev.id,
      name: ev.name,
      venue: ev.venue,
      dj_name: ev.dj_name,
      room_code: ev.room_code,
      status,
      guests_online: onlineRes.count ?? 0,
      event_duration_seconds: durationSec,
      created_at: ev.created_at,
      ended_at: ev.ended_at,
    },
    now_playing: npRes.data
      ? {
          title: npRes.data.title,
          artist: npRes.data.artist,
          artwork: npRes.data.album_art,
          started_at: npRes.data.started_at,
          status: npRes.data.status,
          source: npRes.data.source,
          request_id: npRes.data.now_playing_request_id,
        }
      : null,
    queue,
    trending,
    tips: {
      total_cents: totalTipsCents,
      pending_cents: pendingTipsCents,
      currency: (tipsRes.data?.[0]?.currency) ?? "usd",
      recent: recentTips,
    },
    bridge: {
      paired: true,
      source_type: integ.source_type,
      last_seen: integ.last_seen_at,
      last_sync: new Date().toISOString(),
    },
  });
});
