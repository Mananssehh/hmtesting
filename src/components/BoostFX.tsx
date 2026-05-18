import { useEffect, useState } from "react";
import { Flame, Rocket } from "lucide-react";
import type { BoostEvent } from "@/hooks/useBoostFeed";

interface Props {
  events: BoostEvent[];
}

/**
 * Floating "+N boost" toasts (small) and giant overlay for huge boosts (>=100).
 * Renders fixed/centered, pointer-events: none.
 */
export function BoostFX({ events }: Props) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [mega, setMega] = useState<BoostEvent | null>(null);

  useEffect(() => {
    // Find brand new events we haven't displayed yet
    const fresh = events.filter((e) => !shown.has(e.id));
    if (fresh.length === 0) return;

    // Light haptic on mobile for big boosts
    const bigOne = fresh.find((e) => e.delta >= 50);
    if (bigOne && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(bigOne.delta >= 250 ? [40, 30, 80] : 30); } catch { /* ignore */ }
    }

    const huge = fresh.find((e) => e.delta >= 100);
    if (huge) setMega(huge);

    setShown((cur) => {
      const next = new Set(cur);
      for (const e of fresh) next.add(e.id);
      return next;
    });
  }, [events, shown]);

  useEffect(() => {
    if (!mega) return;
    const t = window.setTimeout(() => setMega(null), 2400);
    return () => window.clearTimeout(t);
  }, [mega]);

  // Only render the 4 most recent floating toasts
  const floating = events.slice(0, 4);

  return (
    <>
      {/* Floating toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-1.5">
        {floating.map((e, i) => (
          <div
            key={e.id}
            className="boost-toast"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-primary/40 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.6)] flex items-center gap-1.5 text-sm font-semibold">
              <Rocket className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary tabular-nums">+{e.delta}</span>
              <span className="text-foreground/85 max-w-[160px] truncate">{e.title}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Giant overlay for huge boosts */}
      {mega && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="boost-mega-bg absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-orange-500/20" />
          <div className="boost-mega relative text-center">
            <div className="flex items-center justify-center gap-3 text-7xl sm:text-8xl font-black tracking-tight drop-shadow-[0_0_40px_hsl(var(--primary)/0.8)]">
              <Flame className="h-16 w-16 sm:h-20 sm:w-20 text-orange-400" strokeWidth={2.4} />
              <span className="vip-shimmer">+{mega.delta}</span>
            </div>
            <div className="mt-2 text-lg sm:text-xl font-bold uppercase tracking-[0.2em] text-foreground/90">
              MEGA BOOST
            </div>
            <div className="mt-1 text-sm text-foreground/70 max-w-xs mx-auto truncate">
              {mega.title} — {mega.artist}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
