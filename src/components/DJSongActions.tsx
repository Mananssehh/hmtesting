import { useState } from "react";
import {
  Copy, Check, Music2, ExternalLink, Play, SkipForward, Trash2,
  ArrowUp, ArrowDown, ChevronsUp, Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { searchLinks, djCopyText } from "@/lib/searchLinks";
import { SongRequestRow } from "@/components/SongRequestCard";

interface Props {
  song: SongRequestRow;
  isPlaying?: boolean;
  onMarkPlaying?: () => void;
  onMarkPlayed?: () => void;
  onSkip?: () => void;
  onRemove?: () => void;
  onMoveTop?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canReorder?: boolean;
}

export function DJSongActions({
  song, isPlaying, onMarkPlaying, onMarkPlayed, onSkip, onRemove,
  onMoveTop, onMoveUp, onMoveDown, canReorder,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`Copied ${label.toLowerCase()}`);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 pl-2 sm:pl-4">
      {/* Primary action */}
      {!isPlaying && onMarkPlaying && (
        <Button size="sm" onClick={onMarkPlaying} className="bg-primary text-primary-foreground h-9">
          <Play className="mr-1 h-4 w-4" /> Now playing
        </Button>
      )}
      {(isPlaying || song.status === "approved" || song.status === "pending") && onMarkPlayed && (
        <Button size="sm" variant="outline" onClick={onMarkPlayed} className="h-9">
          <Check className="mr-1 h-4 w-4" /> Played
        </Button>
      )}
      {onSkip && song.status !== "played" && song.status !== "skipped" && (
        <Button size="sm" variant="outline" onClick={onSkip} className="h-9">
          <SkipForward className="mr-1 h-4 w-4" /> Skip
        </Button>
      )}

      {/* Copy menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-9">
            {copied ? <Check className="mr-1 h-4 w-4 text-success" /> : <Copy className="mr-1 h-4 w-4" />}
            Copy
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">For your DJ software</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => copy("Title - Artist", djCopyText(song))}>
            <Music2 className="mr-2 h-4 w-4" />
            <span className="truncate">Title - Artist</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copy("Title", song.title)}>
            <Copy className="mr-2 h-4 w-4" /> Title only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copy("Artist", song.artist)}>
            <Copy className="mr-2 h-4 w-4" /> Artist only
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* External search menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-9">
            <ExternalLink className="mr-1 h-4 w-4" /> Search
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Open in new tab</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <a href={searchLinks.spotify(song)} target="_blank" rel="noreferrer">Spotify</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={searchLinks.appleMusic(song)} target="_blank" rel="noreferrer">Apple Music</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={searchLinks.youtube(song)} target="_blank" rel="noreferrer">YouTube</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={searchLinks.soundcloud(song)} target="_blank" rel="noreferrer">SoundCloud</a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={searchLinks.google(song)} target="_blank" rel="noreferrer">Google</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reorder */}
      {canReorder && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <Rocket className="mr-1 h-4 w-4" /> Queue
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {onMoveTop && (
              <DropdownMenuItem onClick={onMoveTop}>
                <ChevronsUp className="mr-2 h-4 w-4" /> Move to top
              </DropdownMenuItem>
            )}
            {onMoveUp && (
              <DropdownMenuItem onClick={onMoveUp}>
                <ArrowUp className="mr-2 h-4 w-4" /> Move up
              </DropdownMenuItem>
            )}
            {onMoveDown && (
              <DropdownMenuItem onClick={onMoveDown}>
                <ArrowDown className="mr-2 h-4 w-4" /> Move down
              </DropdownMenuItem>
            )}
            {onMarkPlaying && (
              <DropdownMenuItem onClick={onMarkPlaying}>
                <Play className="mr-2 h-4 w-4" /> Play next
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onRemove && (
        <Button size="sm" variant="ghost" onClick={onRemove} className="text-destructive hover:text-destructive h-9 ml-auto">
          <Trash2 className="mr-1 h-4 w-4" /> Remove
        </Button>
      )}
    </div>
  );
}
