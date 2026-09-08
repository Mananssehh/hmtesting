import { describe, it, expect, vi } from "vitest";
import type { MusicSearchResult } from "@/lib/musicSearch";
import {
  REQUEST_OUTCOMES,
  buildRequestSongArgs,
  requestFeedback,
  submitSongRequest,
  type RequestOutcome,
} from "@/lib/requestSong";
import type { SupabaseRequestSongClient } from "@/integrations/supabase/d5bTypes";
import { readFileSync } from "fs";
import path from "path";

const spotifySong: MusicSearchResult = {
  source_song_id: "4cOdK2wGLETKBW3PvgPWqT",
  source_platform: "spotify",
  title: "Never Gonna Give You Up",
  artist: "Rick Astley",
  album: "Whenever You Need Somebody",
  album_art_url: "https://i.scdn.co/image/ab67616d0000b273abc",
  duration_ms: 213_573,
  preview_url: "https://p.scdn.co/mp3-preview/abc",
  external_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  explicit: false,
};

const itunesSong: MusicSearchResult = {
  source_song_id: "1440857781",
  source_platform: "itunes",
  title: "Bad Guy",
  artist: "Billie Eilish",
  album: "When We All Fall Asleep",
  album_art_url: "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg",
  duration_ms: 194_088,
  preview_url: "https://audio-ssl.itunes.apple.com/preview.m4a",
  external_url: "https://music.apple.com/us/album/bad-guy/1440857781",
  explicit: true,
};

function clientReturning(
  data: unknown,
  error: unknown = null,
): { client: SupabaseRequestSongClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as unknown as SupabaseRequestSongClient, rpc };
}

describe("approved outcome set", () => {
  it("is exactly the eight approved outcomes and excludes requests_closed", () => {
    expect([...REQUEST_OUTCOMES].sort()).toEqual(
      [
        "already_supported",
        "blocked",
        "cooldown",
        "created",
        "explicit_not_allowed",
        "invalid_track",
        "supported_existing",
        "unavailable",
      ].sort(),
    );
    expect(REQUEST_OUTCOMES).not.toContain("requests_closed" as never);
  });

  it("has no requests_closed reference anywhere in the request path", () => {
    const files = ["../lib/requestSong.ts", "../pages/EventPage.tsx"];
    for (const f of files) {
      const src = readFileSync(path.resolve(__dirname, f), "utf8");
      expect(src.includes("requests_closed")).toBe(false);
    }
  });
});

describe("EventPage request path", () => {
  const src = readFileSync(path.resolve(__dirname, "../pages/EventPage.tsx"), "utf8");

  it("calls the adapter and no longer inserts into song_requests directly", () => {
    expect(src).toContain("submitSongRequest(eventInfo.id, song)");
    expect(src).not.toMatch(/from\("song_requests"\)\s*\n?\s*\.insert/);
    expect(src.includes('.from("song_requests").insert')).toBe(false);
  });

  it("no longer performs the separate author-vote upsert", () => {
    expect(src).not.toMatch(/from\("votes"\)[\s\S]{0,120}upsert/);
  });

  it("uses no `as any` cast for request_song", () => {
    expect(src.includes("as any")).toBe(false);
    expect(src.includes('rpc("request_song"')).toBe(false); // goes through the typed adapter
  });

  it("uses provider identity, not title/artist, for the duplicate hint", () => {
    expect(src).toContain("canonicalTrackIdentity(song.source_platform, song.source_song_id)");
    expect(src).toContain("isActiveRequestStatus(s.status)");
  });

  it("adds no optimistic vote arithmetic (counts come from Realtime)", () => {
    expect(src).not.toMatch(/upvotes:\s*\w+\.upvotes\s*\+\s*1/);
  });

  it("wires the Support button to the same request submission handler", () => {
    expect(src).toMatch(/Support this request/);
  });
});

describe("buildRequestSongArgs album-art compatibility", () => {
  it("maps a Spotify result, forwarding the single album art URL", () => {
    const args = buildRequestSongArgs("11111111-1111-1111-1111-111111111111", spotifySong);
    expect(args).toEqual({
      _event_id: "11111111-1111-1111-1111-111111111111",
      _source_platform: "spotify",
      _source_song_id: "4cOdK2wGLETKBW3PvgPWqT",
      _title: "Never Gonna Give You Up",
      _artist: "Rick Astley",
      _album: "Whenever You Need Somebody",
      _album_art_url: "https://i.scdn.co/image/ab67616d0000b273abc",
      _duration_ms: 213_573,
      _preview_url: "https://p.scdn.co/mp3-preview/abc",
      _explicit: false,
      _external_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    });
  });

  it("maps an iTunes result including the 600x600 artwork and explicit flag", () => {
    const args = buildRequestSongArgs("2222", itunesSong);
    expect(args._source_platform).toBe("itunes");
    expect(args._album_art_url).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg",
    );
    expect(args._explicit).toBe(true);
  });

  it("omits album art rather than sending null when the provider has none", () => {
    const args = buildRequestSongArgs("2222", { ...spotifySong, album_art_url: null });
    expect(args._album_art_url).toBeUndefined();
  });

  it("falls back to an Apple search link when the provider gives no external URL", () => {
    const args = buildRequestSongArgs("2222", { ...spotifySong, external_url: "  " });
    expect(args._external_url).toContain("music.apple.com/us/search?term=");
  });
});

describe("submitSongRequest", () => {
  it("calls the typed RPC with the mapped arguments", async () => {
    const { client, rpc } = clientReturning([{ outcome: "created", request_id: "r1" }]);
    const res = await submitSongRequest("ev1", spotifySong, client);
    expect(rpc).toHaveBeenCalledWith("request_song", buildRequestSongArgs("ev1", spotifySong));
    expect(res).toEqual({ outcome: "created", requestId: "r1" });
  });

  it.each(REQUEST_OUTCOMES)("passes through the %s outcome", async (outcome) => {
    const { client } = clientReturning([{ outcome, request_id: null }]);
    expect((await submitSongRequest("ev1", spotifySong, client)).outcome).toBe(outcome);
  });

  it("reports error, never success, on an unexpected RPC error", async () => {
    const { client } = clientReturning(null, { message: "boom" });
    expect(await submitSongRequest("ev1", spotifySong, client)).toEqual({
      outcome: "error",
      requestId: null,
    });
  });

  it("reports error on a thrown transport failure", async () => {
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("network")),
    } as unknown as SupabaseRequestSongClient;
    expect((await submitSongRequest("ev1", spotifySong, client)).outcome).toBe("error");
  });

  it("reports error on an unrecognized outcome instead of treating it as success", async () => {
    const { client } = clientReturning([{ outcome: "requests_closed", request_id: null }]);
    expect((await submitSongRequest("ev1", spotifySong, client)).outcome).toBe("error");
  });
});

describe("requestFeedback", () => {
  it("created: success, +1 point message, starts the cooldown, owns the upvote", () => {
    const f = requestFeedback("created", 30);
    expect(f).toMatchObject({ kind: "success", ownsUpvote: true, startsCooldown: true });
    expect(f.message).toContain("+1 pt");
  });

  it("supported_existing: reports the added support and does not consume cooldown", () => {
    const f = requestFeedback("supported_existing", 30);
    expect(f).toMatchObject({ kind: "success", ownsUpvote: true, startsCooldown: false });
    expect(f.message).toMatch(/vote was added/i);
  });

  it("already_supported: reports no duplicate vote was added", () => {
    const f = requestFeedback("already_supported", 30);
    expect(f).toMatchObject({ kind: "success", startsCooldown: false });
    expect(f.message).toMatch(/already backed/i);
  });

  it.each([
    ["cooldown", /Try again in 30s/],
    ["explicit_not_allowed", /explicit/i],
    ["blocked", /blocked/i],
    ["invalid_track", /couldn't identify/i],
    ["unavailable", /can't request songs/i],
  ] as [RequestOutcome, RegExp][])("%s maps to a failure message", (outcome, re) => {
    const f = requestFeedback(outcome, 30);
    expect(f.kind).toBe("error");
    expect(f.ownsUpvote).toBe(false);
    expect(f.message).toMatch(re);
  });

  it("an unexpected error never renders as success", () => {
    expect(requestFeedback("error", 30)).toMatchObject({ kind: "error", ownsUpvote: false });
  });
});
