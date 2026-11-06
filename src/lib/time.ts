// Wall-clock helpers. Planning happens in the athlete's local time zone
// (bedtime "23:00" means 11pm where they live), while events are stored as
// absolute instants (Date). These helpers convert between the two.

export const DEFAULT_TZ = "America/New_York";

export type LocalDay = { y: number; m: number; d: number }; // m is 1-12

/** Offset of `tz` from UTC at `date`, in minutes (e.g. -300 for EST). */
function offsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** The instant for local wall-clock `minutes` past midnight on `day` in `tz`. */
export function atLocal(day: LocalDay, minutes: number, tz: string): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d) + minutes * 60000;
  let off = offsetMinutes(new Date(guess), tz);
  let result = guess - off * 60000;
  // Re-check once in case the guess straddled a DST change.
  const off2 = offsetMinutes(new Date(result), tz);
  if (off2 !== off) {
    off = off2;
    result = guess - off * 60000;
  }
  return new Date(result);
}

/** Local calendar day of an instant. */
export function localDay(date: Date, tz: string): LocalDay {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** Minutes past local midnight of an instant. */
export function localMinutes(date: Date, tz: string): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(date);
  const [h, mi] = s.split(":").map(Number);
  return h * 60 + mi;
}

export function addDays(day: LocalDay, n: number): LocalDay {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function dayKey(day: LocalDay): string {
  return `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}

export function parseDayKey(key: string): LocalDay {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** "23:30" -> 1410 */
export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Monday of the week containing `day`. */
export function weekStart(day: LocalDay): LocalDay {
  const dow = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay(); // 0 = Sunday
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export const MIN = 60000;
