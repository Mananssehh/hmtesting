import { cn } from "@/lib/utils";
import { searchLinks } from "@/lib/searchLinks";

interface Props {
  title: string;
  artist: string;
  appleMusicUrl?: string | null;
  spotifyUrl?: string | null;
  externalUrl?: string | null;
  sourcePlatform?: string | null;
  className?: string;
  size?: "sm" | "md";
}

const AppleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.03-.81.86-2.13 1.52-3.22 1.43-.14-1.13.43-2.32 1.16-3.06.82-.85 2.22-1.49 3.27-1.4zM20.5 17.34c-.55 1.27-.81 1.83-1.51 2.95-.98 1.56-2.36 3.5-4.07 3.51-1.52.02-1.91-.99-3.97-.98-2.06.01-2.49 1-4.01.99-1.71-.01-3.02-1.77-4-3.33-2.74-4.36-3.03-9.48-1.34-12.2 1.2-1.93 3.09-3.06 4.87-3.06 1.81 0 2.95 1 4.45 1 1.45 0 2.34-1 4.43-1 1.58 0 3.26.86 4.45 2.35-3.91 2.14-3.27 7.73.7 9.77z" />
  </svg>
);

const SpotifyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12C24 5.4 18.66 0 12 0zm5.521 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.103-10.561-1.14-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.3 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

function looksLikeAppleTrack(u: string): boolean {
  return /music\.apple\.com\/.+\/(album|song)\//.test(u) || /music\.apple\.com\/.*[?&]i=\d+/.test(u);
}
function looksLikeSpotifyTrack(u: string): boolean {
  return /open\.spotify\.com\/track\//.test(u);
}

export function PlatformLinks({
  title,
  artist,
  appleMusicUrl,
  spotifyUrl,
  externalUrl,
  sourcePlatform,
  className,
  size = "sm",
}: Props) {
  const meta = { title, artist };
  const ext = (externalUrl ?? "").trim();
  const sp = (sourcePlatform ?? "").toLowerCase();

  // Direct track URLs first (best UX — deep-links into the native app).
  let apple = (appleMusicUrl ?? "").trim();
  if (!apple && ext && (sp === "itunes" || sp === "apple_music" || looksLikeAppleTrack(ext))) {
    apple = ext;
  }
  const appleIsDirect = !!apple && looksLikeAppleTrack(apple);
  if (!apple) apple = searchLinks.appleMusic(meta);

  let spotify = (spotifyUrl ?? "").trim();
  if (!spotify && ext && (sp === "spotify" || looksLikeSpotifyTrack(ext))) {
    spotify = ext;
  }
  const spotifyIsDirect = !!spotify && looksLikeSpotifyTrack(spotify);
  if (!spotify) spotify = searchLinks.spotify(meta);

  const dim = size === "md" ? "h-7 w-7" : "h-6 w-6";
  const icon = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  const base =
    "inline-flex items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04] text-foreground/70 transition-all duration-200 active:scale-90 hover:bg-white/[0.1]";

  const logClick = (platform: "apple" | "spotify", url: string, direct: boolean) => {
    // Visible in browser console + remote logs — helps mobile Safari debugging.
    console.log("[platform-link] click", { platform, title, artist, url, direct });
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <a
        href={apple}
        target="_blank"
        rel="noreferrer"
        aria-label={appleIsDirect ? "Open in Apple Music" : "Search on Apple Music"}
        title={appleIsDirect ? "Apple Music" : "Search Apple Music"}
        onClick={(e) => {
          e.stopPropagation();
          logClick("apple", apple, appleIsDirect);
        }}
        className={cn(base, dim, "hover:text-foreground")}
      >
        <AppleIcon className={icon} />
      </a>
      <a
        href={spotify}
        target="_blank"
        rel="noreferrer"
        aria-label={spotifyIsDirect ? "Open in Spotify" : "Search on Spotify"}
        title={spotifyIsDirect ? "Spotify" : "Search Spotify"}
        onClick={(e) => {
          e.stopPropagation();
          logClick("spotify", spotify, spotifyIsDirect);
        }}
        className={cn(base, dim, "hover:text-[#1DB954]")}
      >
        <SpotifyIcon className={icon} />
      </a>
    </div>
  );
}
