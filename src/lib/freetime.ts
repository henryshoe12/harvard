import { addDays, atLocal, dayKey, MIN, parseClock, type LocalDay } from "./time";
import type { CalEvent } from "./types";

export type FreeBlock = { day: string; start: Date; end: Date };

/**
 * Open time between fixed commitments. Overtime doesn't tell you when to
 * study or sleep; it shows the gaps and lets you decide.
 *
 * Free time is counted between `dayStart` and `dayEnd` each day, and only
 * gaps of at least `minMins` count (a 10 minute gap between class and
 * practice isn't real free time).
 */
export function freeTime(opts: {
  start: LocalDay;
  days?: number;
  events: CalEvent[];
  tz: string;
  dayStart: string; // "07:00"
  dayEnd: string; // "23:00"
  minMins?: number;
}): FreeBlock[] {
  const { start, events, tz } = opts;
  const days = opts.days ?? 7;
  const minMs = (opts.minMins ?? 30) * MIN;
  const open = parseClock(opts.dayStart);
  let close = parseClock(opts.dayEnd);
  if (close <= open) close += 24 * 60; // e.g. until 1am

  const busy = events.filter((e) => !e.allDay).map((e) => ({ start: e.start.getTime(), end: e.end.getTime() }));
  const out: FreeBlock[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    let slots = [{ start: atLocal(day, open, tz).getTime(), end: atLocal(day, close, tz).getTime() }];
    for (const b of busy) {
      const next: typeof slots = [];
      for (const s of slots) {
        if (b.end <= s.start || b.start >= s.end) next.push(s);
        else {
          if (b.start > s.start) next.push({ start: s.start, end: b.start });
          if (b.end < s.end) next.push({ start: b.end, end: s.end });
        }
      }
      slots = next;
    }
    for (const s of slots) if (s.end - s.start >= minMs) out.push({ day: dayKey(day), start: new Date(s.start), end: new Date(s.end) });
  }
  return out;
}

/** Hours in a set of blocks, optionally only the part after `after`. */
export function hoursIn(blocks: { start: Date; end: Date }[], after?: Date): number {
  const cut = after?.getTime() ?? -Infinity;
  return blocks.reduce((n, b) => n + Math.max(0, b.end.getTime() - Math.max(b.start.getTime(), cut)), 0) / 3600000;
}
