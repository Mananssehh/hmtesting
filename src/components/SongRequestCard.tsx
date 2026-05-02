import { ArrowBigDown, ArrowBigUp, Sparkles, ExternalLink, Rocket, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, platformLabel } from "@/lib/searchLinks";

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
  // Phase 4 optional metadata
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
  pending: "bg-muted text-muted-foreground",
  approved: "bg-accent/15 text-accent border-accent/30",
  playing: "bg-primary text-primary-foreground animate-pulse-glow",
  played: "bg-success/15 text-success border-success/30",
  skipped: "bg-muted text-muted-foreground line-through",
  removed: "bg-destructive/15 text-destructive border-destructive/30",
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

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60 hover:border-primary/40 transition-all",
        song.status === "playing" && "ring-1 ring-primary/60 bg-primary/5",
        song.boost > 0 && "ring-1 ring-primary/30 bg-gradient-to-r from-primary/5 to-transparent",
      )}
    >
      {/* Vote column */}
      <div className="flex flex-col items-center gap-0.5 w-10">
        <button
          onClick={() => onVote?.(1)}
          disabled={disabled || !onVote}
          aria-label="Upvote"
          className={cn(
            "p-1 rounded-md transition-colors",
            myVote === 1 ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-primary hover:bg-primary/10",
            (disabled || !onVote) && "opacity-50 cursor-not-allowed hover:bg-transparent",
          )}
        >
          <ArrowBigUp className="h-6 w-6" strokeWidth={myVote === 1 ? 0 : 2} fill={myVote === 1 ? "currentColor" : "none"} />
        </button>
        <span className={cn("text-sm font-bold tabular-nums", score > 0 && "text-primary", score < 0 && "text-muted-foreground")}>
          {score}
        </span>
        <button
          onClick={() => onVote?.(-1)}
          disabled={disabled || !onVote}
          aria-label="Downvote"
          className={cn(
            "p-1 rounded-md transition-colors",
            myVote === -1 ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-accent hover:bg-accent/10",
            (disabled || !onVote) && "opacity-50 cursor-not-allowed hover:bg-transparent",
          )}
        >
          <ArrowBigDown className="h-6 w-6" strokeWidth={myVote === -1 ? 0 : 2} fill={myVote === -1 ? "currentColor" : "none"} />
        </button>
      </div>

      {rank !== undefined && (
        <div className="hidden sm:flex items-center justify-center w-8 text-lg font-bold text-muted-foreground tabular-nums">
          {rank}
        </div>
      )}

      {/* Album art */}
      <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden bg-muted shrink-0">
        {(song.album_art_url || song.album_art) ? (
          <img src={song.album_art_url || song.album_art!} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/40 to-accent/40" />
        )}
        {song.boost > 0 && (
          <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
            <Sparkles className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* Title block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold truncate">{song.title}</h3>
          {song.explicit && (
            <span className="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground border border-border">E</span>
          )}
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize border", statusStyles[song.status])}>
            {song.status}
          </Badge>
          {song.boost > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/40 gap-1">
              <Sparkles className="h-2.5 w-2.5" /> +{song.boost}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
        <p className="text-xs text-muted-foreground/70 truncate flex items-center gap-2">
          <span>Requested by {song.requester_name}</span>
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

      <div className="flex items-center gap-1 shrink-0">
        {onBoost && song.status !== "played" && song.status !== "skipped" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onBoost}
            className="text-primary hover:text-primary hover:bg-primary/10 h-8 px-2"
            aria-label="Boost"
          >
            <Rocket className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline text-xs">Boost</span>
          </Button>
        )}
        {song.external_url && (
          <Button asChild size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
            <a href={song.external_url} target="_blank" rel="noreferrer" aria-label="Open in Spotify">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
