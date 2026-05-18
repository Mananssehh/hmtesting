import { useEffect, useRef } from "react";
import { Music, Pause, Disc3 } from "lucide-react";
import { toast } from "sonner";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { NowPlayingStatus } from "@/lib/nowPlaying";
import { cn } from "@/lib/utils";
import { PlatformLinks } from "@/components/PlatformLinks";

interface Props {
  eventId: string;
}

const STATUS_META: Record<
  NowPlayingStatus,
  { label: string; pillClass: string; icon: React.ReactNode }
> = {
  playing: {
    label: "Now Playing",
    pillClass: "bg-primary/15 text-primary border-primary/25",
    icon: <Disc3 className="h-3 w-3 animate-spin [animation-duration:4s]" />,
  },
  mixing: {
    label: "Mixing Next",
    pillClass: "bg-accent/15 text-accent border-accent/25",
    icon: <Music className="h-3 w-3" />,
  },
  paused: {
    label: "Paused",
    pillClass: "bg-secondary/60 text-muted-foreground border-transparent",
    icon: <Pause className="h-3 w-3" />,
  },
};

export function NowPlayingDisplay({ eventId }: Props) {
  const { nowPlaying, loading } = useNowPlaying(eventId);
  const lastToastKey = useRef<string | null>(null);

  const trackKey = nowPlaying
    ? `${nowPlaying.title}-${nowPlaying.artist ?? ""}`
    : null;

  useEffect(() => {
    if (!nowPlaying || !trackKey) return;
    console.log("[now-playing render] row", nowPlaying);
    if (lastToastKey.current === null) {
      // Skip toast on initial mount; just remember current track
      lastToastKey.current = trackKey;
      return;
    }
    if (lastToastKey.current !== trackKey) {
      lastToastKey.current = trackKey;
      toast(`Now Playing: ${nowPlaying.title}${nowPlaying.artist ? ` — ${nowPlaying.artist}` : ""}`, {
        icon: <Disc3 className="h-4 w-4 text-primary" />,
        duration: 4000,
      });
    }
  }, [trackKey, nowPlaying]);

  if (loading) return null;

  if (!nowPlaying) {
    console.log("[now-playing render] empty", { eventId });
    return (
      <div className="relative mb-5 p-4 sm:p-5 rounded-2xl glass-strong overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
            <Music className="h-8 w-8 text-foreground/40" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-secondary/60 text-muted-foreground border-transparent">
              <Disc3 className="h-3 w-3" />
              <span>Now Playing</span>
            </span>
            <div className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-muted-foreground">
              No track playing yet.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const status = (nowPlaying.status as NowPlayingStatus) ?? "playing";
  const meta = STATUS_META[status] ?? STATUS_META.playing;
  const sourceLabel = (() => {
    const s = (nowPlaying.source ?? "").toLowerCase();
    if (!s || s === "manual") return "DJ";
    if (s === "bridge" || s === "decks_bridge") return "Bridge";
    if (s.includes("apple")) return "Apple Music";
    if (s.includes("spotify")) return "Spotify";
    return nowPlaying.source;
  })();

  return (
    <div className="relative mb-5 p-4 sm:p-5 rounded-2xl glass-strong overflow-hidden transition-all duration-500">
      {/* Subtle blurred album art backdrop */}
      {nowPlaying.album_art && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 blur-3xl scale-125 transition-opacity duration-700"
          style={{
            backgroundImage: `url(${nowPlaying.album_art})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-card/30 to-card/60" />

      <div key={trackKey} className="relative animate-fade-in">
        <div className="flex items-center gap-4">
          {nowPlaying.album_art ? (
            <img
              src={nowPlaying.album_art}
              alt=""
              className={cn(
                "h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover shadow-elevated shrink-0 transition-all duration-500",
                status === "playing" && "animate-scale-in",
              )}
            />
          ) : (
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center shrink-0 shadow-elevated">
              <Music className="h-8 w-8 text-foreground/60" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                  meta.pillClass,
                )}
              >
                {meta.icon}
                <span>{meta.label}</span>
              </span>
              {sourceLabel && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border border-border/60 bg-background/40 text-muted-foreground">
                  {sourceLabel}
                </span>
              )}
            </div>
            <div className="mt-2 text-lg sm:text-xl font-semibold truncate tracking-tight">
              {nowPlaying.title}
            </div>
            {nowPlaying.artist && (
              <div className="text-[13px] sm:text-sm text-muted-foreground truncate mt-0.5">{nowPlaying.artist}</div>
            )}
            <div className="mt-2">
              <PlatformLinks
                title={nowPlaying.title}
                artist={nowPlaying.artist ?? ""}
                size="md"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
