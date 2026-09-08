// D5B request-submission adapter.
//
// Single boundary between the UI and public.request_song. Extracted from
// EventPage so the whole request flow is unit-testable without React.

import type { MusicSearchResult } from "@/lib/musicSearch";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type RequestSongArgs =
  Database["public"]["Functions"]["request_song"]["Args"];
export type RequestSongRow =
  Database["public"]["Functions"]["request_song"]["Returns"][number];
/** The officially typed Supabase client used for the request boundary. */
export type SupabaseRequestSongClient = typeof supabase;

/**
 * The complete approved outcome set. There is deliberately no
 * `requests_closed`: nonexistent, inaccessible, banned, inactive, ended and
 * paused events all collapse into the generic `unavailable`.
 */
export const REQUEST_OUTCOMES = [
  "created",
  "supported_existing",
  "already_supported",
  "unavailable",
  "cooldown",
  "explicit_not_allowed",
  "blocked",
  "invalid_track",
] as const;

export type RequestOutcome = (typeof REQUEST_OUTCOMES)[number];

/**
 * Client-side only outcomes (never returned by the RPC):
 * - `error`: an unexpected transport/database failure.
 * - `legacy_duplicate_conflict`: the database rejected the insert on the
 *   pre-D5D legacy title/artist index `song_requests_unique_active`, which
 *   still exists until the Stage D enforcement migration drops it. This is
 *   NOT a ninth RPC outcome; it is a transitional mapping of a raw database
 *   error. Errors from `song_requests_unique_active_provider` or any other
 *   constraint must never map here.
 */
export type RequestResult = {
  outcome: RequestOutcome | "error" | "legacy_duplicate_conflict";
  requestId: string | null;
};

/** Legacy title/artist index name, exact match only (not the _provider one). */
const LEGACY_ACTIVE_INDEX = "song_requests_unique_active";

function isLegacyActiveIndexError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const haystack = [e.message, e.details, e.hint, e.constraint]
    .filter((v): v is string => typeof v === "string")
    .join(" | ");
  // Word-boundary match so `song_requests_unique_active_provider` never matches.
  return new RegExp(`(^|[^A-Za-z0-9_])${LEGACY_ACTIVE_INDEX}([^A-Za-z0-9_]|$)`).test(
    haystack,
  );
}


export type RequestFeedback = {
  kind: "success" | "error";
  message: string;
  /** Whether the caller now holds an upvote on requestId. */
  ownsUpvote: boolean;
  /** Whether the client-side cooldown timer should restart. */
  startsCooldown: boolean;
  /** Whether the request sheet should close. */
  closeSheet: boolean;
};

function appleSearchFallback(title: string, artist: string): string {
  return `https://music.apple.com/us/search?term=${encodeURIComponent(
    `${title} ${artist}`.trim(),
  )}`;
}

/**
 * Maps a provider search result to the RPC arguments.
 *
 * Album art: both Spotify and iTunes results expose a single
 * `album_art_url` (Spotify `album.images[0].url`; iTunes `artworkUrl100`
 * upscaled to 600x600). The RPC writes that one value into BOTH
 * `song_requests.album_art` and `song_requests.album_art_url`, exactly as the
 * previous direct INSERT did, so every downstream consumer is unchanged.
 */
export function buildRequestSongArgs(
  eventId: string,
  song: MusicSearchResult,
): RequestSongArgs {
  return {
    _event_id: eventId,
    _source_platform: song.source_platform,
    _source_song_id: song.source_song_id ?? "",
    _title: song.title,
    _artist: song.artist,
    _album: song.album,
    _album_art_url: song.album_art_url ?? undefined,
    _duration_ms: song.duration_ms,
    _preview_url: song.preview_url ?? undefined,
    _explicit: song.explicit,
    _external_url:
      (song.external_url && song.external_url.trim()) ||
      appleSearchFallback(song.title, song.artist),
  };
}

function isRequestOutcome(v: unknown): v is RequestOutcome {
  return typeof v === "string" && (REQUEST_OUTCOMES as readonly string[]).includes(v);
}

/** Calls the typed RPC. Never throws; unexpected failures become `error`. */
export async function submitSongRequest(
  eventId: string,
  song: MusicSearchResult,
  client: SupabaseRequestSongClient = supabase,
): Promise<RequestResult> {
  const args = buildRequestSongArgs(eventId, song);
  try {
    const { data, error } = await client.rpc("request_song", args);
    if (error)
      return {
        outcome: isLegacyActiveIndexError(error) ? "legacy_duplicate_conflict" : "error",
        requestId: null,
      };
    const row = Array.isArray(data) ? data[0] : data;
    const outcome = (row as { outcome?: unknown } | null | undefined)?.outcome;
    if (!isRequestOutcome(outcome)) return { outcome: "error", requestId: null };
    const requestId =
      (row as { request_id?: string | null } | null | undefined)?.request_id ?? null;
    return { outcome, requestId };
  } catch (thrown) {
    return {
      outcome: isLegacyActiveIndexError(thrown) ? "legacy_duplicate_conflict" : "error",
      requestId: null,
    };
  }

}

export function requestFeedback(
  outcome: RequestResult["outcome"],
  cooldownSeconds: number,
): RequestFeedback {
  switch (outcome) {
    case "created":
      return {
        kind: "success",
        message: "Song requested! +1 pt 🎶",
        ownsUpvote: true,
        startsCooldown: true,
        closeSheet: true,
      };
    case "supported_existing":
      return {
        kind: "success",
        message: "Already in the queue — your vote was added 👍",
        ownsUpvote: true,
        startsCooldown: false,
        closeSheet: true,
      };
    case "already_supported":
      return {
        kind: "success",
        message: "You've already backed this one — it's in the queue.",
        ownsUpvote: true,
        startsCooldown: false,
        closeSheet: true,
      };
    case "cooldown":
      return {
        kind: "error",
        message: `Slow down! Try again in ${cooldownSeconds}s`,
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };
    case "explicit_not_allowed":
      return {
        kind: "error",
        message: "This event isn't accepting explicit songs.",
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };
    case "blocked":
      return {
        kind: "error",
        message: "The DJ has blocked this song or artist.",
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };
    case "invalid_track":
      return {
        kind: "error",
        message: "We couldn't identify that track. Try another version.",
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };
    case "unavailable":
      return {
        kind: "error",
        message: "You can't request songs for this event right now.",
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };
    case "legacy_duplicate_conflict":
      // Transitional: removed once Stage D drops song_requests_unique_active.
      return {
        kind: "error",
        message:
          "This song can't be added right now because it matches another request in this event.",
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };

    default:
      return {
        kind: "error",
        message: "Couldn't send that request — please try again.",
        ownsUpvote: false,
        startsCooldown: false,
        closeSheet: false,
      };
  }
}
