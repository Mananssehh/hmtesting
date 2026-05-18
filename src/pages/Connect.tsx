import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Radio, Copy, Download, Loader2, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function detectPlatform() {
  if (typeof navigator === "undefined") return { isMac: false, isMobile: false };
  const ua = navigator.userAgent;
  const platform = (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isMac = !isMobile && /Mac|Macintosh|Mac OS X/i.test(platform + " " + ua);
  return { isMac, isMobile };
}

export default function Connect() {
  const [params] = useSearchParams();
  const rawCode = (params.get("code") ?? "").trim();
  const code = useMemo(() => rawCode.replace(/\D/g, "").slice(0, 6), [rawCode]);
  const isValid = code.length === 6;

  const { isMac, isMobile } = useMemo(detectPlatform, []);
  const [bridgeMissing, setBridgeMissing] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // On Mac desktop: try to open decksbridge:// scheme
  useEffect(() => {
    if (!isValid || !isMac) return;
    setAttempted(true);
    const start = Date.now();
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `decksbridge://pair?code=${code}`;
    document.body.appendChild(iframe);

    const timer = setTimeout(() => {
      // If page is still visible after ~2.5s, assume the scheme didn't open Bridge
      if (document.visibilityState === "visible" && Date.now() - start >= 2400) {
        setBridgeMissing(true);
      }
      iframe.remove();
    }, 2500);

    const onHide = () => {
      // App opened — cancel the "missing" state
      clearTimeout(timer);
      setBridgeMissing(false);
    };
    document.addEventListener("visibilitychange", onHide, { once: true });

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      iframe.remove();
    };
  }, [isValid, isMac, code]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const openBridge = () => {
    setBridgeMissing(false);
    setAttempted(true);
    window.location.href = `decksbridge://pair?code=${code}`;
    setTimeout(() => {
      if (document.visibilityState === "visible") setBridgeMissing(true);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-primary/30 bg-card/40 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Radio className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Connect Decks Bridge</h1>
        </div>

        {!isValid && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm flex gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Invalid pairing code</div>
              <div className="text-muted-foreground mt-1">
                The link is missing a valid 6-digit code. Generate a new code from your DJ dashboard.
              </div>
            </div>
          </div>
        )}

        {isValid && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {isMobile
                ? "Open Decks Bridge on your Mac and enter this code:"
                : isMac
                ? "Opening Decks Bridge… If nothing happens, enter this code manually:"
                : "Open Decks Bridge on your Mac and enter this code:"}
            </p>

            <button
              onClick={copyCode}
              className="group w-full rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/20 py-6 transition-colors mb-4"
              aria-label="Copy pairing code"
            >
              <div className="font-mono text-5xl sm:text-6xl font-bold tracking-[0.3em] text-center text-foreground select-all">
                {code}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 text-center inline-flex items-center gap-1 w-full justify-center">
                <Copy className="h-3 w-3" /> Tap to copy
              </div>
            </button>

            {isMac && attempted && !bridgeMissing && (
              <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground flex items-center gap-2 mb-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Trying to open Decks Bridge…
              </div>
            )}

            {isMac && (
              <div className="flex gap-2 mb-3">
                <Button onClick={openBridge} variant="premium" className="flex-1">
                  <Check className="mr-2 h-4 w-4" /> Open Decks Bridge
                </Button>
              </div>
            )}

            {bridgeMissing && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-2">
                <div className="flex items-center gap-2 font-medium text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  Decks Bridge not installed
                </div>
                <p className="text-muted-foreground text-xs">
                  Download the Decks Bridge desktop app, then enter the 6-digit code above to pair.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href="https://linku99.com/download/decks-bridge" target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" /> Download Decks Bridge
                  </a>
                </Button>
              </div>
            )}

            {isMobile && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Decks Bridge runs on macOS. Open it on the Mac you're DJing from.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
