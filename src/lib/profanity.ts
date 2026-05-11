// Lightweight profanity / spam filter. Intentionally small, no external deps.
const BAD_WORDS = [
  "fuck","shit","bitch","cunt","dick","asshole","bastard","slut","whore",
  "nigger","nigga","faggot","retard","kike","spic","chink","tranny",
];

/**
 * Normalize text so simple bypasses ("F E I N", "F.E.I.N", "F-E-I-N") collapse
 * to the same canonical form before we run any blocklist / profanity check.
 */
export function normalizeForMatch(text: string): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const normalized = normalizeForMatch(text);
  return BAD_WORDS.some((w) => normalized.includes(w));
}

export function cleanText(text: string): string {
  if (!text) return text;
  let out = text;
  for (const w of BAD_WORDS) {
    out = out.replace(new RegExp(`\\b${w}\\w*`, "gi"), (m) => "*".repeat(m.length));
  }
  return out;
}

const SPAMMY = /(.)\1{4,}|https?:\/\/|www\.|@[a-z0-9_]{3,}/i;
export function looksSpammy(text: string): boolean {
  return SPAMMY.test(text);
}
