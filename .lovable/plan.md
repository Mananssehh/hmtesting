## Root cause

Both bugs come from the same defect: **`now_playing` (broadcast row) and `song_requests.status='playing'` are two separate sources of truth that drift apart**, and `NowPlayingDisplay` merges fields across them.

### Bug 1 — Artwork mismatch
`src/components/NowPlayingDisplay.tsx` resolves fields independently:

```
title    = nowPlaying?.title    ?? fallbackRequest?.title
artist   = nowPlaying?.artist   ?? fallbackRequest?.artist
albumArt = nowPlaying?.album_art || matchedRequest?.album_art
                                 || matchedRequest?.album_art_url
                                 || fallbackRequest?.album_art
                                 || fallbackRequest?.album_art_url
```

When the Bridge posts a track Serato doesn't have artwork for, `now_playing.album_art` is `null` (see `supabase/functions/now-playing-ingest/index.ts`: `album_art: b.album_art ?? null`). Title/artist come from the bridge row, but `album_art` silently falls back to a **different track** — the previous `status='playing'` song_request, or a fuzzy-matched older request. Result: "Aimoye – Kayode" with Money Constant artwork. The DB is correct; the UI is mixing rows.

The edge function logs confirm bridge posts (`Aimoye / Kayode`, `Abena / Joeboy`, `Accepting My Flaws / Future`) all returned `"no confident match"`, so `now_playing_request_id` stays `null` and the fallback art is whatever stale row remains.

### Bug 2 — Manual "Set as Now Playing" not visible to guests
`src/pages/DJEventManage.tsx` `updateStatus(id, "playing")` only writes `song_requests.status='playing'`. **It never writes the `now_playing` table.** When the Bridge is connected, `now_playing` keeps showing whatever bridge last posted; the DJ's manual pick only changes the local `fallbackRequest` on the DJ's own screen. Guests' `useNowPlaying` reads `now_playing` and sees the bridge's track. When bridge is disconnected the DJ click also doesn't update `now_playing`, but `NowPlayingDisplay` happens to pick it up via `fallbackRequest` — so it "looks like it works" only when no broadcast row exists.

So: the last writer to `now_playing` is **always the bridge** (when connected). Manual selections are never written to that table.

---

## Fix

Make `now_playing` the single source of truth for what guests see, and always write all three fields (`title`, `artist`, `album_art`) together — never partial. Stop cross-row field merging in the display.

### 1. Manual "Set as Now Playing" writes `now_playing`
`src/pages/DJEventManage.tsx` — in `updateStatus`, when `status === "playing"`, after updating `song_requests`, call `updateNowPlaying({ eventId, title, artist, albumArt: album_art ?? album_art_url ?? "", source: "manual_dj", status: "playing" })` using the picked song's fields. This atomically replaces the broadcast row with the DJ's choice (title + artist + art together), overriding any bridge row.

### 2. Bridge ingest: stamp source + don't leave art null when we have a match
`supabase/functions/now-playing-ingest/index.ts` — when `matchedRequestId` is found, also copy `album_art` from the matched `song_request` into the `now_playing` row if `b.album_art` is null. Keep `source` as `"decks_bridge"`. This guarantees the broadcast row never has mixed title/art from different tracks.

### 3. Display reads broadcast row only (no cross-row field merging)
`src/components/NowPlayingDisplay.tsx` — change resolution to "all-or-nothing per source":

- If `nowPlaying` exists → use **its** `title`, `artist`, `album_art` (art may be empty, then show the placeholder; never borrow art from another row).
- Else if `fallbackRequest` exists → use **its** `title`, `artist`, and `album_art ?? album_art_url`.

Remove the chained `||` that pulls art from `matchedRequest` / `fallbackRequest` when a broadcast row is present.

Also key the `<img>` with `key={\`${title}-${artist}-${nowPlaying?.updated_at ?? ""}\`}` to defeat any image cache.

### 4. Temporary diagnostics (kept short, removed after verification)
- `now-playing-ingest`: keep existing `[bridge-match]` logs; add one line logging the final row `{ title, artist, album_art, source, matchedRequestId }` before insert/update.
- `DJEventManage.updateStatus`: `console.log("[np-write] manual_dj", { id, title, artist, album_art })` right before/after the `updateNowPlaying` call.
- `useNowPlaying`: already logs fetched rows — leave as is.

### 5. Test matrix
1. Bridge disconnected → DJ "Set as Now Playing" on Song A → guest sees A (title, artist, art all A). Switch to B → guest sees B.
2. Bridge connected, posting C → guest sees C. DJ manually picks A → guest sees A (manual wins, last writer).
3. Bridge posts D with no artwork → guest sees D's title/artist with placeholder art (NOT a previous track's art).
4. Rapid A → B → C bridge posts → guest's title/artist/art stay aligned per track.

---

## Files changed
- `src/pages/DJEventManage.tsx` — write `now_playing` from `updateStatus` when marking playing.
- `src/components/NowPlayingDisplay.tsx` — atomic per-source field resolution + img `key`.
- `supabase/functions/now-playing-ingest/index.ts` — backfill `album_art` from matched request; final-row log.

No DB schema or migration changes needed.
