import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Singleton: only one preview plays at a time across the app.
let currentAudio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function setCurrent(a: HTMLAudioElement | null) {
  if (currentAudio && currentAudio !== a) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = a;
  listeners.forEach((l) => l());
}

interface Props {
  src: string;
  size?: "sm" | "icon";
  className?: string;
  label?: string;
}

export function PreviewButton({ src, size = "sm", className, label = "Preview" }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = new Audio(src);
    a.preload = "none";
    a.addEventListener("ended", () => setPlaying(false));
    a.addEventListener("pause", () => {
      if (currentAudio === a) setPlaying(false);
    });
    audioRef.current = a;
    const sync = () => {
      if (currentAudio !== a) setPlaying(false);
    };
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
      a.pause();
      if (currentAudio === a) currentAudio = null;
    };
  }, [src]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      setCurrent(a);
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  if (size === "icon") {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={toggle}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className={cn("h-8 w-8", className)}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={toggle} className={cn("h-9", className)}>
      {playing ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
      {playing ? "Pause" : label}
    </Button>
  );
}
