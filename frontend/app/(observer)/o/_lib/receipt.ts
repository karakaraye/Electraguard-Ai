/** Receipt codes (contract 1.1): `EG-XXXX-XXXX`, Crockford base32 without I, L, O, U; the last symbol checks the other seven. */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Upper-case, drop spaces and hyphens, O→0, I/L→1, then re-insert the hyphens. */
export function normaliseReceipt(input: string): string {
  let text = input.toUpperCase().replace(/[\s\-_.]/g, "");
  if (text.startsWith("EG")) text = text.slice(2);
  text = text.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!text) return "";
  return `EG-${text.slice(0, 4)}${text.length > 4 ? `-${text.slice(4, 8)}` : ""}${text.length > 8 ? text.slice(8) : ""}`;
}

/** Same check as the server: Σ (i+1)·value(symbol i) over the first seven symbols, mod 31. */
export function receiptValid(code: string): boolean {
  const match = /^EG-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})$/.exec(code);
  if (!match) return false;
  const symbols = match[1] + match[2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (i + 1) * ALPHABET.indexOf(symbols[i]);
  return ALPHABET[sum % 31] === symbols[7];
}
