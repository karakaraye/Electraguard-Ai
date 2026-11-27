import { localeTags, type Locale } from "../lib/i18n/config";

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, options: Intl.DateTimeFormatOptions, key: string) {
  const id = `${locale}:${key}`;
  let format = cache.get(id);
  if (!format) {
    const tag = localeTags[locale];
    const supported = Intl.DateTimeFormat.supportedLocalesOf([tag]);
    format = new Intl.DateTimeFormat(supported.length ? tag : "en-NG", { timeZone: "Africa/Lagos", ...options });
    cache.set(id, format);
  }
  return format;
}

function toDate(value: Date | number | string) {
  return value instanceof Date ? value : new Date(value);
}

/** "22 Nov 2026, 14:05 WAT". Election times are always shown in West Africa Time. */
export function formatWatDateTime(value: Date | number | string | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatter(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }, "dt").format(d)} WAT`;
}

/** "22 Nov, 14:05 WAT": rows in a list, where the year is not needed. */
export function formatWatShort(value: Date | number | string | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatter(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, "ds").format(d)} WAT`;
}

/** "14:05 WAT" */
export function formatWatTime(value: Date | number | string | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatter(locale, { timeStyle: "short", hourCycle: "h23" }, "t").format(d)} WAT`;
}

/** "1.4 MB", "820 KB" */
export function formatBytes(bytes: number, locale: Locale): string {
  const tag = localeTags[locale];
  const supported = Intl.NumberFormat.supportedLocalesOf([tag]).length ? tag : "en-NG";
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(supported, { maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1024))} KB`;
  }
  return `${new Intl.NumberFormat(supported, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}
