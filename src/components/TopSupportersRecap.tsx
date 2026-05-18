import { Trophy, Flame } from "lucide-react";
import type { SongRequestRow } from "./SongRequestCard";

interface Props {
  songs: SongRequestRow[];
}

/**
 * End-of-night recap. Aggregates total boosts per requester from songs they requested
 * (the only attribution we can do client-side without DJ-only point transactions).
 */
export function TopSupportersRecap({ songs }: Props) {
  const byUser = new Map<string, { name: string; boost: number; played: number }>();
  for (const s of songs) {
    const key = s.requested_by || s.requester_name || "guest";
    const cur = byUser.get(key) || { name: s.requester_name || "Guest", boost: 0, played: 0 };
    cur.boost += s.boost ?? 0;
    if (s.status === "played") cur.played += 1;
    byUser.set(key, cur);
  }
  const top = [...byUser.values()]
    .filter((u) => u.boost > 0 || u.played > 0)
    .sort((a, b) => b.boost - a.boost || b.played - a.played)
    .slice(0, 5);

  if (top.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl glass-strong p-4 sm:p-5 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-amber-500/10 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm uppercase tracking-[0.18em] font-bold vip-shimmer">Top supporters tonight</h2>
        </div>
        <ol className="space-y-2">
          {top.map((u, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                i === 0 ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50" :
                i === 1 ? "bg-slate-300/15 text-slate-200 ring-1 ring-slate-300/40" :
                i === 2 ? "bg-orange-400/15 text-orange-300 ring-1 ring-orange-400/40" :
                "bg-secondary text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold truncate ${i === 0 ? "vip-shimmer" : ""}`}>{u.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {u.played} played · {u.boost} boost
                </div>
              </div>
              <div className="flex items-center gap-1 text-primary font-bold tabular-nums">
                <Flame className="h-3.5 w-3.5" />+{u.boost}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
