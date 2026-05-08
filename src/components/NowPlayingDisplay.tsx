import { Music, Pause, Disc3 } from "lucide-react";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { NowPlayingStatus } from "@/lib/nowPlaying";

interface Props {
  eventId: string;
}

const STATUS_META: Record<NowPlayingStatus, { label: string; className: string; icon: React.ReactNode }> = {
  playing: {
    label: "Now Playing",
    className: "bg-primary/15 text-primary border-primary/40",
    icon: <Disc3 className="h-3 w-3 animate-spin-slow" />,
  },
  mixing: {
    label: "Mixing Next",
    className: "bg-accent/15 text-accent border-accent/40",
    icon: <Music className="h-3 w-3" />,
  },
  paused: {
    label: "Paused",
    className: "bg-muted text-muted-foreground border-border",
    icon: <Pause className="h-3 w-3" />,
  },
};

export function NowPlayingDisplay({ eventId }: Props) {
  const { nowPlaying, loading } = useNowPlaying(eventId);

  if (loading || !nowPlaying) return null;

  const status = (nowPlaying.status as NowPlayingStatus) ?? "playing";
  const meta = STATUS_META[status] ?? STATUS_META.playing;

  return (
    <div className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 border border-primary/30 shadow-lg backdrop-blur transition-all">
      <div className="flex items-center gap-3">
        {nowPlaying.album_art ? (
          <img
            src={nowPlaying.album_art}
            alt=""
            className={
              "h-16 w-16 rounded-xl object-cover shadow-md shrink-0 " +
              (status === "playing" ? "ring-2 ring-primary/60" : "")
            }
          />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center shrink-0">
            <Music className="h-7 w-7 text-primary-foreground/80" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span
            className={
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border " +
              meta.className
            }
          >
            {meta.icon}
            {meta.label}
          </span>
          <div className="mt-1 text-base sm:text-lg font-bold truncate">{nowPlaying.title}</div>
          {nowPlaying.artist && (
            <div className="text-sm text-muted-foreground truncate">{nowPlaying.artist}</div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground text-right italic">Updated by DJ</p>
    </div>
  );
}
