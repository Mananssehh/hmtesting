import { ChevronUp, ChevronDown, CircleDollarSign, Clock, Swords, Crown, Pin, Shield, TrendingUp, ArrowUp, ArrowDown, Trash2, Flag } from "lucide-react";
import { ENABLE_BOOSTS, ENABLE_TIPS } from "@/lib/featureFlags";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDuration, platformLabel } from "@/lib/searchLinks";
import { PlatformLinks } from "@/components/PlatformLinks";

// Shared sessionStorage key helper for scroll restoration on Back from /users/:id
const scrollKey = (path: string) => `decks:scroll:${path}`;

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
  played_at?: string | null;
  played_by_source?: string | null;
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
  eventId?: string | null;
  myVote?: 1 | -1 | 0;
  onVote?: (value: 1 | -1) => void;
  /** Open the Tip-the-DJ flow (or Boost flow when ENABLE_BOOSTS). */
  onTip?: () => void;
  onRemove?: () => void;
  onReport?: () => void;
  disabled?: boolean;
  battle?: boolean;
  mostWanted?: boolean;
  pinned?: boolean;
  moderation?: boolean;
  trending?: boolean;
  movement?: "up" | "down" | "same" | "new";
  /** Total tipped amount in cents (succeeded tips only). Renders a "$X tipped" badge. */
  tipTotalCents?: number;
  tipCount?: number;
}


export function SongRequestCard({ rank, song, eventId, myVote = 0, onVote, onTip, onRemove, onReport, disabled, battle, mostWanted, pinned, moderation, trending, movement, tipTotalCents, tipCount }: Props) {
  const location = useLocation();
  // Score is votes only — tips never affect placement.
  // When boosts are re-enabled, boost is added back as a visibility-only weight.
  const score = ENABLE_BOOSTS
    ? song.upvotes - song.downvotes + (song.boost ?? 0)
    : song.upvotes - song.downvotes;
  const upvoted = myVote === 1;
  const downvoted = myVote === -1;

  // Heat tiers. Strong neon border (heat-2/3) is reserved for songs in an
  // active battle. Non-battle boosted songs get only the subtle heat-1 ring,
  // so a runaway leader doesn't dominate the UI with glow.
  const boost = song.boost ?? 0;
  const heatClass = battle
    ? (boost >= 100 ? "boost-heat-3" : boost >= 25 ? "boost-heat-2" : "boost-heat-1")
    : (boost >= 5 ? "boost-heat-1" : "");

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/[0.05] shadow-card transition-all duration-200",
        "hover:border-white/[0.1] hover:bg-card/80",
        song.status === "playing" && "ring-1 ring-primary/40 bg-primary/[0.04]",
        heatClass,
        battle && "battle-pulse",
        trending && "trending-glow",
      )}
    >
      {/* Reddit-style vote column */}
      <div className="flex flex-col items-center gap-0.5 shrink-0 -ml-0.5">
        <button
          onClick={() => onVote?.(1)}
          disabled={disabled || !onVote}
          aria-label="Upvote"
          aria-pressed={upvoted}
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 tap-target",
            upvoted
              ? "bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.45)]"
              : "text-foreground/55 hover:bg-white/[0.06] hover:text-primary",
            (disabled || !onVote) && "opacity-50 cursor-not-allowed",
          )}
        >
          <ChevronUp className="h-5 w-5" strokeWidth={upvoted ? 2.75 : 2.25} />
        </button>
        <span
          key={score}
          className={cn(
            "text-[12px] font-semibold tabular-nums leading-none px-1 transition-colors duration-150 animate-in fade-in zoom-in-95",
            upvoted ? "text-primary" : downvoted ? "text-foreground/60" : "text-foreground/80",
          )}
        >
          {score > 0 ? `+${score}` : score}
        </span>
        <button
          onClick={() => onVote?.(-1)}
          disabled={disabled || !onVote}
          aria-label="Downvote"
          aria-pressed={downvoted}
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 tap-target",
            downvoted
              ? "bg-secondary text-secondary-foreground border border-white/[0.08]"
              : "text-foreground/55 hover:bg-white/[0.06] hover:text-foreground/80",
            (disabled || !onVote) && "opacity-50 cursor-not-allowed",
          )}
        >
          <ChevronDown className="h-5 w-5" strokeWidth={downvoted ? 2.75 : 2.25} />
        </button>
      </div>

      {rank !== undefined && (
        <div className="hidden sm:flex items-center justify-center w-5 text-sm font-semibold text-muted-foreground/70 tabular-nums">
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
            <CircleDollarSign className="h-2.5 w-2.5" />
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
            <Badge className={cn(
              "text-[10px] px-1.5 py-0 border rounded-md gap-1",
              boost >= 100 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
              boost >= 25  ? "bg-primary/25 text-primary-foreground border-primary/40" :
              "bg-primary/15 text-primary border-primary/25"
            )}>
              <CircleDollarSign className="h-2.5 w-2.5" />
              +{song.boost}
            </Badge>
          )}
          {battle && (
            <Badge className="text-[10px] px-1.5 py-0 bg-orange-500/20 text-orange-300 border-orange-500/40 rounded-md gap-1">
              <Swords className="h-2.5 w-2.5" /> Battle
            </Badge>
          )}
          {trending && (
            <Badge className="text-[10px] px-1.5 py-0 bg-gradient-to-r from-orange-500/25 to-pink-500/25 text-orange-200 border-orange-400/50 rounded-md gap-1 animate-pulse">
              <TrendingUp className="h-2.5 w-2.5" /> Trending
            </Badge>
          )}
          {movement === "up" && (
            <span className="inline-flex items-center text-[10px] text-emerald-400 font-semibold tabular-nums gap-0.5">
              <ArrowUp className="h-2.5 w-2.5" />
            </span>
          )}
          {movement === "down" && (
            <span className="inline-flex items-center text-[10px] text-muted-foreground/70 gap-0.5">
              <ArrowDown className="h-2.5 w-2.5" />
            </span>
          )}
          {movement === "new" && (
            <span className="text-[9px] font-bold px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">NEW</span>
          )}
          {mostWanted && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-400/20 text-amber-300 border-amber-400/40 rounded-md gap-1">
              <Crown className="h-2.5 w-2.5" /> Most Wanted
            </Badge>
          )}
          {pinned && (
            <Badge className="text-[10px] px-1.5 py-0 bg-accent/20 text-accent border-accent/40 rounded-md gap-1">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </Badge>
          )}
          {moderation && (
            <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-border rounded-md gap-1">
              <Shield className="h-2.5 w-2.5" /> Awaiting review
            </Badge>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground truncate">{song.artist}</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <PlatformLinks
            title={song.title}
            artist={song.artist}
            externalUrl={song.external_url}
            sourcePlatform={song.source_platform}
          />
          <p className="text-[11px] text-muted-foreground/60 truncate flex items-center gap-2">
            {song.requested_by ? (
              <Link
                to={`/users/${song.requested_by}`}
                state={{ from: location.pathname + location.search, scrollY: typeof window !== "undefined" ? window.scrollY : 0, eventId: eventId ?? null }}

                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    sessionStorage.setItem(scrollKey(location.pathname + location.search), String(window.scrollY));
                  } catch {
                    /* ignore */
                  }
                }}
                className="truncate max-w-[8rem] hover:text-primary hover:underline underline-offset-2 transition-colors tap-target"
              >
                {song.requester_name}
              </Link>
            ) : (
              <span className="truncate max-w-[8rem]">{song.requester_name}</span>
            )}
            {formatDuration(song.duration_ms) && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />{formatDuration(song.duration_ms)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tip the DJ */}
      {onTip && ENABLE_TIPS && song.status !== "played" && song.status !== "skipped" && (
        <button
          onClick={onTip}
          aria-label="Tip the DJ"
          title="Tip the DJ (does not affect placement)"
          className="shrink-0 h-8 px-3 rounded-full flex items-center gap-1 text-[12px] font-semibold border transition-all duration-200 active:scale-95 tap-target bg-primary/10 text-primary border-primary/25 hover:bg-primary/15"
        >
          <CircleDollarSign className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Tip DJ</span>
        </button>
      )}

      {/* Remove own pending request */}
      {onRemove && song.status === "pending" && (
        <button
          onClick={onRemove}
          aria-label="Remove my request"
          title="Remove my request"
          className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors tap-target"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {/* Report this request */}
      {onReport && (
        <button
          onClick={onReport}
          aria-label="Report this request"
          title="Report"
          className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors tap-target"
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
