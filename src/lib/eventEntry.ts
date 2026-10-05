import { supabase } from "@/integrations/supabase/client";

/**
 * Event entry resolution shared by the join-by-code screen and direct event links.
 *
 * Being able to READ an event is not proof of participation: the owner policy
 * (dj_id = auth.uid()) and a stale/partial state can both expose the row while
 * no event_participants record exists. Guests without that record cannot request
 * songs, and the DJ's guest list stops refreshing. So membership is verified
 * explicitly and the atomic join boundary (join-event) is invoked when missing.
 *
 * join-event is rate limited per user and per shared IP, so returning members
 * never touch it; only true first joins do.
 */

export interface EventEntryInfo {
  id: string;
  name: string;
  venue: string | null;
  dj_name: string;
  is_active: boolean;
  requests_status: "live" | "paused" | "ended";
  allow_explicit: boolean;
  require_approval: boolean;
  cooldown_seconds: number;
  rules_text: string | null;
}

const EVENT_COLUMNS =
  "id, dj_id, name, venue, dj_name, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text";

async function callJoin(code: string, nickname: string) {
  const { data, error } = await supabase.functions.invoke("join-event", {
    body: { code: code.toUpperCase(), nickname },
  });
  const payload = data as { ok?: boolean; event?: EventEntryInfo } | null;
  if (error || !payload?.ok || !payload.event) return null;
  return { ...payload.event, is_active: true } as EventEntryInfo;
}

/**
 * Returns the event for this visitor, guaranteeing an event_participants row
 * exists for non-owner visitors. Returns null when the event is unavailable.
 */
export async function resolveEventEntry(
  code: string,
  userId: string,
  nickname: string,
): Promise<EventEntryInfo | null> {
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("room_code", code.toUpperCase())
    .maybeSingle();

  const row = data as (EventEntryInfo & { dj_id: string }) | null;

  // Not readable -> not a member: the join boundary is the only way in.
  if (!row) return callJoin(code, nickname);

  const { dj_id, ...event } = row;
  if (dj_id === userId) return event as EventEntryInfo;

  const { data: participant } = await supabase
    .from("event_participants")
    .select("id")
    .eq("event_id", row.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!participant) {
    // Direct-link guest (or a guest whose participation was lost): join now so
    // song requests work and the DJ's guest list sees them.
    const joined = await callJoin(code, nickname);
    if (!joined) return null;
    return { ...(event as EventEntryInfo), ...joined, id: row.id };
  }

  // Existing participant: do NOT call join-event. Every call consumes the
  // shared per-IP allowance, so returning guests opening new tabs could lock
  // out first-time joiners on the same venue Wi-Fi.
  return event as EventEntryInfo;
}
