import { useEffect, useRef } from "react";
import { Music, Pause, Disc3, Flame, ArrowBigUp, User } from "lucide-react";
import { toast } from "sonner";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { NowPlayingStatus } from "@/lib/nowPlaying";
import { cn } from "@/lib/utils";
import { PlatformLinks } from "@/components/PlatformLinks";
import type { SongRequestRow } from "@/components/SongRequestCard";

interface Props {
  eventId: string;
  /** Optional matched request from the queue — merged into the hero card. */
  matchedRequest?: SongRequestRow | null;
  /** Optional fallback request (DJ marked playing) if no broadcast row exists. */
  fallbackRequest?: SongRequestRow | null;
}

export function NowPlayingDisplay({ eventId, matchedRequest, fallbackRequest }: Props) {
  const { nowPlaying, loading } = useNowPlaying(eventId);
  const lastToastKey = useRef<string | null>(null);

  // Atomic per-source resolution: never mix title from one row with album_art from another.
  // Broadcast row (now_playing) wins as a whole; otherwise fall back to the DJ-marked request.
  let title: string | null = null;
  let artist: string | null = null;
  let albumArt: string | null = null;

  if (nowPlaying?.title) {
    title = nowPlaying.title;
    artist = nowPlaying.artist ?? null;
    albumArt = nowPlaying.album_art || null;
  } else if (fallbackRequest?.title) {
    title = fallbackRequest.title;
    artist = fallbackRequest.artist ?? null;
    albumArt = fallbackRequest.album_art || fallbackRequest.album_art_url || null;
  }

  const status: NowPlayingStatus =
    (nowPlaying?.status as NowPlayingStatus) ?? (fallbackRequest ? "playing" : "playing");

  const request = matchedRequest ?? fallbackRequest ?? null;
  const trackKey = title ? `${title}-${artist ?? ""}` : null;
  const imgKey = `${title ?? ""}-${artist ?? ""}-${nowPlaying?.updated_at ?? ""}`;

  useEffect(() => {
    if (!title || !trackKey) return;
    if (lastToastKey.current === null) {
      lastToastKey.current = trackKey;
      return;
    }
    if (lastToastKey.current !== trackKey) {
      lastToastKey.current = trackKey;
      toast(`Now Playing: ${title}${artist ? ` — ${artist}` : ""}`, {
        icon: <Disc3 className="h-4 w-4 text-primary" />,
        duration: 4000,
      });
    }
  }, [trackKey, title, artist]);

  if (loading && !fallbackRequest) return null;

  if (!title) {
    return (
      <div className="relative mb-5 p-5 sm:p-6 rounded-3xl glass-strong overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
            <Music className="h-9 w-9 text-foreground/40" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              Now Playing
            </span>
            <div className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-muted-foreground">
              Waiting for the next track…
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPlaying = status === "playing";
  const isPaused = status === "paused";

  return (
    <div
      className={cn(
        "relative mb-5 p-5 sm:p-7 rounded-3xl glass-strong overflow-hidden transition-all duration-500",
        isPlaying && "shadow-[0_0_60px_-15px_hsl(var(--primary)/0.45)]",
      )}
    >
      {/* Blurred album-art backdrop */}
      {albumArt && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 blur-3xl scale-125 transition-opacity duration-700"
          style={{
            backgroundImage: `url(${albumArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-card/30 to-card/70" />
      {isPlaying && (
        <div
          aria-hidden
          className="absolute -inset-px rounded-3xl pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, hsl(var(--primary)/0.18), transparent 60%)",
          }}
        />
      )}

      <div key={trackKey} className="relative animate-fade-in">
        <div className="flex items-center gap-4 sm:gap-5">
          {albumArt ? (
            <img
              key={imgKey}
              src={albumArt}
              alt=""
              className={cn(
                "h-24 w-24 sm:h-32 sm:w-32 rounded-2xl object-cover shadow-elevated shrink-0 transition-all duration-500",
                isPlaying && "animate-scale-in",
              )}
            />
          ) : (
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center shrink-0 shadow-elevated">
              <Music className="h-10 w-10 text-foreground/60" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isPaused ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <Pause className="h-3 w-3" /> Paused
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-70" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Now Playing
                </span>
              )}
              {isPlaying && (
                <Equalizer />
              )}
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-semibold truncate tracking-tight">
              {title}
            </div>
            {artist && (
              <div className="text-sm text-muted-foreground truncate mt-0.5">{artist}</div>
            )}

            {/* Requester + boost stats (only when matched to a request) */}
            {request && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {request.requester_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-secondary/60 text-foreground/80 border border-border/40">
                    <User className="h-3 w-3" />
                    {request.requester_name}
                  </span>
                )}
                {(request.boost ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-orange-500/15 text-orange-300 border border-orange-500/30">
                    <Flame className="h-3 w-3" />
                    {request.boost}
                  </span>
                )}
                {(request.upvotes ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary border border-primary/20">
                    <ArrowBigUp className="h-3 w-3" />
                    {request.upvotes}
                  </span>
                )}
              </div>
            )}

            <div className="mt-3">
              <PlatformLinks
                title={title}
                artist={artist ?? ""}
                appleMusicUrl={nowPlaying?.apple_url ?? null}
                spotifyUrl={nowPlaying?.spotify_url ?? null}
                externalUrl={request?.external_url ?? null}
                sourcePlatform={request?.source_platform ?? null}
                size="md"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Equalizer() {
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px] h-3">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2px] bg-primary/80 rounded-sm animate-pulse"
          style={{
            height: `${30 + ((i * 37) % 70)}%`,
            animationDelay: `${i * 120}ms`,
            animationDuration: `${800 + i * 90}ms`,
          }}
        />
      ))}
    </span>
  );
}
