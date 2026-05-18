import { Crown, Flame } from "lucide-react";
import type { SongRequestRow } from "./SongRequestCard";

interface Props {
  song: SongRequestRow;
  lead: number;
}

export function DominatingBanner({ song, lead }: Props) {
  return (
    <div className="mb-3 relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-orange-500/10 to-primary/15 p-3 sm:p-3.5">
      <div aria-hidden className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_50%,hsl(14_95%_60%/0.5),transparent_60%),radial-gradient(circle_at_80%_50%,hsl(322_90%_62%/0.5),transparent_60%)]" />
      <div className="relative flex items-center gap-3">
        <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-muted shrink-0 ring-2 ring-primary/60 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.8)]">
          {(song.album_art_url || song.album_art) ? (
            <img src={song.album_art_url || song.album_art!} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary to-orange-500" />
          )}
          <div className="flame" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="vip-shimmer">Currently dominating</span>
          </div>
          <div className="mt-0.5 font-semibold truncate text-[15px] leading-tight">{song.title}</div>
          <div className="text-[12px] text-muted-foreground truncate">
            {song.artist} · requested by {song.requester_name}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1 text-primary font-bold tabular-nums text-lg leading-none">
            <Flame className="h-4 w-4" />+{song.boost}
          </div>
          {lead > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1">+{lead} ahead</div>
          )}
        </div>
      </div>
    </div>
  );
}
