/**
 * Phone-side prompt for likely personal names and phone numbers (O-09 logic).
 * It warns once; it never blocks or rewrites. The server runs its own check.
 */

const HONORIFICS = /\b(mr|mrs|ms|miss|dr|alhaji|alhaja|chief|hon|oga|mama|baba|madam|pastor|imam|prince|princess)\.?\s+[A-Z][\p{L}'-]+/iu;
const PHONE = /(\+?234[\s-]?[789][01]\d[\s-]?\d{3}[\s-]?\d{4})|\b0[789][01]\d{8}\b/;
const STOP = new Set([
  "INEC",
  "Presiding",
  "Officer",
  "Polling",
  "Unit",
  "Ward",
  "Local",
  "Government",
  "Area",
  "State",
  "BVAS",
  "APC",
  "PDP",
  "LP",
  "NNPP",
  "ADC",
  "Police",
  "Primary",
  "School",
  "Secondary",
  "Market",
  "Mosque",
  "Church",
]);

export function looksLikeName(text: string, placeWords: string[] = []): boolean {
  if (!text.trim()) return false;
  if (PHONE.test(text) || HONORIFICS.test(text)) return true;
  const stop = new Set([...STOP, ...placeWords]);
  for (const sentence of text.split(/[.!?\n]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    let run = 0;
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\p{L}'-]/gu, "");
      const capital = /^\p{Lu}\p{Ll}+/u.test(word) && !stop.has(word);
      // The first word of a sentence is capitalised anyway.
      if (capital && i > 0) {
        run += 1;
        if (run >= 2) return true;
      } else {
        run = 0;
      }
    }
  }
  return false;
}

/** Short stable hash of the text, so an acknowledgement is forgotten when the text changes. */
export function textHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
