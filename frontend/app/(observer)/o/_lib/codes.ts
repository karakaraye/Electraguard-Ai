/** Observer code helpers (contract 1.1). Codes are checked on the phone so a typo is caught offline. */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Trim, upper-case, drop spaces and hyphens, O→0, I→1, L→1, then "OBS-" + six symbols. */
export function normaliseObserverCode(input: string): string {
  let text = input.trim().toUpperCase().replace(/[\s\-_.]/g, "");
  if (text.startsWith("OBS")) text = text.slice(3);
  else if (text.startsWith("0BS")) text = text.slice(3);
  text = text.replace(/O/g, "0").replace(/[IL]/g, "1");
  return text ? `OBS-${text}` : "";
}

/** Five random symbols and a check symbol: (Σ (i+1)·vᵢ) mod 31, same alphabet. */
export function observerCodeValid(code: string): boolean {
  const match = /^OBS-([0-9A-HJKMNP-TV-Z]{6})$/.exec(code);
  if (!match) return false;
  const symbols = match[1];
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += (i + 1) * ALPHABET.indexOf(symbols[i]);
  return ALPHABET[sum % 31] === symbols[5];
}

/** Local PIN rules mirroring AUTH-03 (the server decides). */
export function pinTooSimple(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const up = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const down = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  if (up || down) return true;
  // A year such as 199012 or 202611 (YYYYMM): easy to guess.
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(pin)) return true;
  return false;
}
