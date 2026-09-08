import { describe, it, expect } from "vitest";
import { canonicalTrackIdentity, sameTrack, isActiveRequestStatus } from "@/lib/trackIdentity";

describe("canonicalTrackIdentity", () => {
  it("accepts a bare Spotify track id", () => {
    expect(canonicalTrackIdentity("spotify", "4cOdK2wGLETKBW3PvgPWqT")).toEqual({
      platform: "spotify",
      id: "4cOdK2wGLETKBW3PvgPWqT",
    });
  });

  it("normalizes Spotify URIs and URLs to the same id", () => {
    const bare = canonicalTrackIdentity("spotify", "4cOdK2wGLETKBW3PvgPWqT");
    expect(canonicalTrackIdentity("spotify", "spotify:track:4cOdK2wGLETKBW3PvgPWqT")).toEqual(bare);
    expect(
      canonicalTrackIdentity("spotify", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x"),
    ).toEqual(bare);
  });

  it("maps apple_music to the stored itunes provider", () => {
    expect(canonicalTrackIdentity("apple_music", "1440857781")).toEqual(
      canonicalTrackIdentity("itunes", "1440857781"),
    );
  });

  it("rejects missing, blank or malformed identifiers", () => {
    expect(canonicalTrackIdentity(null, "123")).toBeNull();
    expect(canonicalTrackIdentity("spotify", "  ")).toBeNull();
    expect(canonicalTrackIdentity("spotify", "not-a-track-id")).toBeNull();
    expect(canonicalTrackIdentity("itunes", "abc")).toBeNull();
    expect(canonicalTrackIdentity("mock", "123")).toBeNull();
  });
});

describe("sameTrack", () => {
  const a = canonicalTrackIdentity("spotify", "4cOdK2wGLETKBW3PvgPWqT");

  it("matches only identical provider identities", () => {
    expect(sameTrack(a, canonicalTrackIdentity("spotify", "4cOdK2wGLETKBW3PvgPWqT"))).toBe(true);
    // A remix/live version carries a different track id and stays separate.
    expect(sameTrack(a, canonicalTrackIdentity("spotify", "1cOdK2wGLETKBW3PvgPWqZ"))).toBe(false);
    // Same numeric-looking id on another provider is not the same track.
    expect(sameTrack(canonicalTrackIdentity("itunes", "123"), canonicalTrackIdentity("spotify", "123"))).toBe(false);
  });

  it("never matches when identity is unknown", () => {
    expect(sameTrack(null, null)).toBe(false);
    expect(sameTrack(a, null)).toBe(false);
  });
});

describe("isActiveRequestStatus", () => {
  it("treats only queue-relevant statuses as active", () => {
    expect(["pending", "approved", "playing"].every(isActiveRequestStatus)).toBe(true);
    expect(["played", "skipped", "removed"].some(isActiveRequestStatus)).toBe(false);
  });
});
