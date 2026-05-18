import { Rocket } from "lucide-react";
import type { BoostEvent } from "@/hooks/useBoostFeed";

interface Props {
  events: BoostEvent[];
}

/**
 * Persistent horizontal ticker of recent boost activity.
 * Shows a muted placeholder when idle.
 */
export function BoostActivityStrip({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="mb-3 px-3 py-1.5 rounded-full bg-secondary/40 border border-white/[0.04] text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Rocket className="h-3 w-3" />
        <span>Boost a song to push it up the queue — activity shows up here live.</span>
      </div>
    );
  }

  // Duplicate the list so the marquee loops seamlessly
  const loop = [...events, ...events];

  return (
    <div className="mb-3 relative overflow-hidden rounded-full bg-gradient-to-r from-primary/10 via-card/60 to-primary/10 border border-primary/20 h-8">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent z-10" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent z-10" />
      <div className="animate-marquee flex items-center gap-6 h-full whitespace-nowrap px-4 will-change-transform">
        {loop.map((e, i) => (
          <span key={`${e.id}-${i}`} className="inline-flex items-center gap-1.5 text-[12px]">
            <Rocket className="h-3 w-3 text-primary shrink-0" />
            <span className="font-semibold text-primary tabular-nums">+{e.delta}</span>
            <span className="text-foreground/85 truncate max-w-[180px]">{e.title}</span>
            <span className="text-muted-foreground/70">for {e.requester}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
