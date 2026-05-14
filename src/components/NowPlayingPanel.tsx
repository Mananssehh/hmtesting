import { useEffect, useState } from "react";
import { Music, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { updateNowPlaying, NowPlayingStatus } from "@/lib/nowPlaying";

interface Props {
  eventId: string;
  prefill?: { title?: string; artist?: string; albumArt?: string };
}

const STATUS_OPTIONS: { value: NowPlayingStatus; label: string }[] = [
  { value: "playing", label: "Now Playing" },
  { value: "mixing", label: "Mixing Next" },
  { value: "paused", label: "Paused" },
];

export function NowPlayingPanel({ eventId, prefill }: Props) {
  const { nowPlaying } = useNowPlaying(eventId);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [albumArt, setAlbumArt] = useState("");
  const [status, setStatus] = useState<NowPlayingStatus>("playing");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (nowPlaying) {
      setTitle(nowPlaying.title ?? "");
      setArtist(nowPlaying.artist ?? "");
      setAlbumArt(nowPlaying.album_art ?? "");
      setStatus((nowPlaying.status as NowPlayingStatus) ?? "playing");
    }
  }, [nowPlaying?.id]);

  const useTopRequest = () => {
    if (!prefill?.title) return;
    setTitle(prefill.title);
    setArtist(prefill.artist ?? "");
    setAlbumArt(prefill.albumArt ?? "");
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Track title is required");
      return;
    }
    setSaving(true);
    try {
      await updateNowPlaying({
        eventId,
        title: title.trim(),
        artist: artist.trim(),
        albumArt: albumArt.trim(),
        status,
        source: "dj-panel",
      });
      toast.success("Now Playing updated for guests 🎶");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update Now Playing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl glass-strong space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          <Radio className="h-3.5 w-3.5 text-primary" /> Now Playing
        </div>
        {prefill?.title && (
          <Button size="sm" variant="ghost" type="button" onClick={useTopRequest} className="h-7 text-xs">
            Use top request
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="np-title" className="text-xs text-muted-foreground">Title</Label>
          <Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track title" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-artist" className="text-xs text-muted-foreground">Artist</Label>
          <Input id="np-artist" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="np-art" className="text-xs text-muted-foreground">Album art URL</Label>
        <Input id="np-art" value={albumArt} onChange={(e) => setAlbumArt(e.target.value)} placeholder="https://..." />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={
                "px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-95 " +
                (status === opt.value
                  ? "bg-primary text-primary-foreground border-primary shadow-glow-sm"
                  : "bg-white/[0.04] border-white/[0.06] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={submit} disabled={saving || !title.trim()} variant="premium" className="w-full h-11">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Music className="h-4 w-4 mr-2" />}
        Update Now Playing
      </Button>

      {nowPlaying && (
        <p className="text-[11px] text-muted-foreground/70 text-center">
          Last update {new Date(nowPlaying.updated_at).toLocaleTimeString()} — guests see this live.
        </p>
      )}
    </div>
  );
}
