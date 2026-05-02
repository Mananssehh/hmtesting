// Lightweight profanity / spam filter. Intentionally small, no external deps.
const BAD_WORDS = [
  "fuck","shit","bitch","cunt","dick","asshole","bastard","slut","whore",
  "nigger","nigga","faggot","retard","kike","spic","chink","tranny",
];

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return BAD_WORDS.some((w) => new RegExp(`\\b${w}\\w*`, "i").test(t));
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
