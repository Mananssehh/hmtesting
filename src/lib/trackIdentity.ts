// Canonical provider identity for a track. Mirrors the normalization inside the
// public.request_song database function so the client and server agree on what
// "the same song" means. Title/artist are never part of the identity.

export const ACTIVE_REQUEST_STATUSES = ["pending", "approved", "playing"] as const;

export type TrackIdentity = { platform: string; id: string } | null;

export function canonicalTrackIdentity(
  sourcePlatform?: string | null,
  sourceSongId?: string | null,
): TrackIdentity {
  let platform = (sourcePlatform ?? "").trim().toLowerCase();
  if (platform === "apple_music" || platform === "itunes") platform = "itunes";
  const raw = (sourceSongId ?? "").trim();
  if (!platform || !raw) return null;

  if (platform === "spotify") {
    if (/^[A-Za-z0-9]{22}$/.test(raw)) return { platform, id: raw };
    const uri = raw.match(/^spotify:track:([A-Za-z0-9]{22})$/);
    if (uri) return { platform, id: uri[1] };
    const url = raw.match(/^https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/);
    if (url) return { platform, id: url[1] };
    return null;
  }

  if (platform === "itunes") {
    return /^[0-9]+$/.test(raw) ? { platform, id: raw } : null;
  }

  return null;
}

export function sameTrack(a: TrackIdentity, b: TrackIdentity): boolean {
  return !!a && !!b && a.platform === b.platform && a.id === b.id;
}

export function isActiveRequestStatus(status: string): boolean {
  return (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(status);
}
