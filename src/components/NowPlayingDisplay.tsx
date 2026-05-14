import { Music, Pause, Disc3 } from "lucide-react";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { NowPlayingStatus } from "@/lib/nowPlaying";
import { cn } from "@/lib/utils";

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

  if (loading || !nowPlaying) return null;

  const status = (nowPlaying.status as NowPlayingStatus) ?? "playing";
  const meta = STATUS_META[status] ?? STATUS_META.playing;
  const trackKey = `${nowPlaying.title}-${nowPlaying.artist}-${status}`;

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
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                meta.pillClass,
              )}
            >
              {meta.icon}
              <span>{meta.label}</span>
            </span>
            <div className="mt-2 text-lg sm:text-xl font-semibold truncate tracking-tight">
              {nowPlaying.title}
            </div>
            {nowPlaying.artist && (
              <div className="text-[13px] sm:text-sm text-muted-foreground truncate mt-0.5">{nowPlaying.artist}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
