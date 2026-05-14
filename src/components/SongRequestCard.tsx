import { Flame, X, Sparkles, ExternalLink, Rocket, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, platformLabel, resolveExternalUrl } from "@/lib/searchLinks";

export interface SongRequestRow {
  id: string;
  title: string;
  artist: string;
  album_art: string | null;
  external_url: string | null;
  upvotes: number;
  downvotes: number;
  boost: number;
  status: "pending" | "approved" | "playing" | "played" | "skipped" | "removed";
  requester_name: string;
  requested_by?: string | null;
  created_at: string;
  album?: string | null;
  album_art_url?: string | null;
  duration_ms?: number | null;
  preview_url?: string | null;
  source_platform?: string | null;
  source_song_id?: string | null;
  explicit?: boolean | null;
  queue_position?: number | null;
}

const statusStyles: Record<SongRequestRow["status"], string> = {
  pending: "bg-secondary/60 text-muted-foreground border-transparent",
  approved: "bg-accent/15 text-accent border-accent/25",
  playing: "bg-primary/20 text-primary border-primary/30",
  played: "bg-success/15 text-success border-success/25",
  skipped: "bg-secondary/60 text-muted-foreground line-through border-transparent",
  removed: "bg-destructive/15 text-destructive border-destructive/25",
};

interface Props {
  rank?: number;
  song: SongRequestRow;
  myVote?: 1 | -1 | 0;
  onVote?: (value: 1 | -1) => void;
  onBoost?: () => void;
  disabled?: boolean;
}

export function SongRequestCard({ rank, song, myVote = 0, onVote, onBoost, disabled }: Props) {
  const score = song.upvotes - song.downvotes + song.boost;
  const externalUrl = resolveExternalUrl(song);
  const hyped = myVote === 1;
  const passed = myVote === -1;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/[0.05] shadow-card transition-all duration-200",
        "hover:border-white/[0.1] hover:bg-card/80",
        song.status === "playing" && "ring-1 ring-primary/40 bg-primary/[0.04]",
        song.boost > 0 && "ring-1 ring-primary/20",
      )}
    >
      {rank !== undefined && (
        <div className="hidden sm:flex items-center justify-center w-6 text-sm font-semibold text-muted-foreground/70 tabular-nums">
          {rank}
        </div>
      )}

      {/* Album art */}
      <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-xl overflow-hidden bg-muted shrink-0 shadow-sm">
        {(song.album_art_url || song.album_art) ? (
          <img src={song.album_art_url || song.album_art!} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/30 to-accent/30" />
        )}
        {song.boost > 0 && (
          <div className="absolute top-1 right-1 bg-primary/90 text-primary-foreground rounded-full p-0.5 shadow-sm">
            <Sparkles className="h-2.5 w-2.5" />
          </div>
        )}
      </div>

      {/* Title block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className="font-semibold truncate tracking-tight text-[15px] leading-snug">{song.title}</h3>
          {song.explicit && (
            <span className="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground/80">E</span>
          )}
          {song.status !== "pending" && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize border rounded-md", statusStyles[song.status])}>
              {song.status}
            </Badge>
          )}
          {song.boost > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/25 rounded-md gap-1">
              <Sparkles className="h-2.5 w-2.5" /> +{song.boost}
            </Badge>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground truncate">{song.artist}</p>
        <p className="text-[11px] text-muted-foreground/60 truncate flex items-center gap-2 mt-0.5">
          <span className="truncate">{song.requester_name}</span>
          {formatDuration(song.duration_ms) && (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />{formatDuration(song.duration_ms)}
            </span>
          )}
          {song.source_platform && song.source_platform !== "mock" && (
            <span className="hidden sm:inline">· {platformLabel(song.source_platform)}</span>
          )}
        </p>
      </div>

      {/* Action column — Hype / Pass / Boost as iOS-style pill group */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Score chip */}
          <div className={cn(
            "min-w-[2.25rem] h-8 px-2 rounded-full flex items-center justify-center text-[13px] font-semibold tabular-nums border transition-colors",
            score > 0 ? "bg-primary/10 text-primary border-primary/20" :
            score < 0 ? "bg-secondary/60 text-muted-foreground border-transparent" :
            "bg-secondary/40 text-foreground/70 border-transparent",
          )}>
            {score > 0 ? `+${score}` : score}
          </div>

          {/* Hype */}
          <button
            onClick={() => onVote?.(1)}
            disabled={disabled || !onVote}
            aria-label="Hype"
            aria-pressed={hyped}
            title="Hype"
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center border transition-all duration-200 active:scale-90 tap-target",
              hyped
                ? "bg-primary text-primary-foreground border-primary shadow-glow-sm"
                : "bg-white/[0.04] text-foreground/70 border-white/[0.06] hover:bg-white/[0.08] hover:text-primary",
              (disabled || !onVote) && "opacity-50 cursor-not-allowed",
            )}
          >
            <Flame className="h-4 w-4" fill={hyped ? "currentColor" : "none"} strokeWidth={hyped ? 1.5 : 2} />
          </button>

          {/* Pass */}
          <button
            onClick={() => onVote?.(-1)}
            disabled={disabled || !onVote}
            aria-label="Pass"
            aria-pressed={passed}
            title="Pass"
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center border transition-all duration-200 active:scale-90 tap-target",
              passed
                ? "bg-secondary text-foreground border-border"
                : "bg-white/[0.04] text-foreground/60 border-white/[0.06] hover:bg-white/[0.08] hover:text-foreground",
              (disabled || !onVote) && "opacity-50 cursor-not-allowed",
            )}
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>

          {/* Boost */}
          {onBoost && song.status !== "played" && song.status !== "skipped" && (
            <button
              onClick={onBoost}
              aria-label="Boost"
              title="Boost"
              className="h-8 px-3 rounded-full flex items-center gap-1 text-[12px] font-semibold border transition-all duration-200 active:scale-95 tap-target bg-primary/10 text-primary border-primary/25 hover:bg-primary/15"
            >
              <Rocket className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Boost</span>
            </button>
          )}
        </div>

        {externalUrl && (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground/70 hover:text-foreground opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <a href={externalUrl} target="_blank" rel="noreferrer" aria-label={`Open in ${platformLabel(song.source_platform)}`}>
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
