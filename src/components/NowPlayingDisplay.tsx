import { Music, Pause, Disc3 } from "lucide-react";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { NowPlayingStatus } from "@/lib/nowPlaying";

interface Props {
  eventId: string;
}

const STATUS_META: Record<
  NowPlayingStatus,
  { label: string; pillClass: string; icon: React.ReactNode; ring: string; glow: string }
> = {
  playing: {
    label: "Now Playing",
    pillClass: "bg-primary/20 text-primary border-primary/50",
    icon: <Disc3 className="h-3 w-3 animate-spin [animation-duration:3s]" />,
    ring: "ring-2 ring-primary/60",
    glow: "from-primary/25 via-card/60 to-accent/15",
  },
  mixing: {
    label: "Mixing Next",
    pillClass: "bg-accent/20 text-accent border-accent/50",
    icon: <Music className="h-3 w-3 animate-pulse" />,
    ring: "ring-2 ring-accent/60 animate-pulse",
    glow: "from-accent/25 via-card/60 to-primary/15",
  },
  paused: {
    label: "Paused",
    pillClass: "bg-muted text-muted-foreground border-border",
    icon: <Pause className="h-3 w-3" />,
    ring: "ring-1 ring-border",
    glow: "from-muted/40 via-card/60 to-muted/20",
  },
};

export function NowPlayingDisplay({ eventId }: Props) {
  const { nowPlaying, loading } = useNowPlaying(eventId);

  if (loading || !nowPlaying) return null;

  const status = (nowPlaying.status as NowPlayingStatus) ?? "playing";
  const meta = STATUS_META[status] ?? STATUS_META.playing;

  // Re-mount inner content when track changes for smooth fade transition
  const trackKey = `${nowPlaying.title}-${nowPlaying.artist}-${status}`;

  return (
    <div
      className={
        "relative mb-4 p-4 rounded-2xl border border-primary/30 shadow-xl backdrop-blur overflow-hidden transition-all duration-500 bg-gradient-to-br " +
        meta.glow
      }
    >
      {/* Blurred album art backdrop */}
      {nowPlaying.album_art && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 blur-2xl scale-110 transition-opacity duration-700"
          style={{
            backgroundImage: `url(${nowPlaying.album_art})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      <div key={trackKey} className="relative animate-fade-in">
        <div className="flex items-center gap-3">
          {nowPlaying.album_art ? (
            <img
              src={nowPlaying.album_art}
              alt=""
              className={
                "h-20 w-20 rounded-xl object-cover shadow-lg shrink-0 transition-all duration-500 " +
                meta.ring +
                (status === "playing" ? " animate-scale-in" : "")
              }
            />
          ) : (
            <div
              className={
                "h-20 w-20 rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center shrink-0 " +
                meta.ring
              }
            >
              <Music className="h-8 w-8 text-primary-foreground/80" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <span
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest border " +
                meta.pillClass
              }
            >
              {meta.icon}
              <span>{meta.label}</span>
              {status === "mixing" && (
                <span className="inline-flex gap-0.5 ml-0.5" aria-hidden>
                  <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1 w-1 rounded-full bg-accent animate-bounce" />
                </span>
              )}
            </span>
            <div className="mt-1.5 text-base sm:text-lg font-bold truncate tracking-tight">
              {nowPlaying.title}
            </div>
            {nowPlaying.artist && (
              <div className="text-sm text-muted-foreground truncate">{nowPlaying.artist}</div>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground text-right italic">DJ marked this as playing</p>
      </div>
    </div>
  );
}
