import type { FreeBlock } from "./freetime";
import { dayKey, localDay, localMinutes } from "./time";
import type { CalEvent } from "./types";

// "Suggest a plan": a proposal the athlete can accept, trim or ignore. It only
// uses their free time, spreads big tasks into sessions, finishes work before
// it's due, and keeps game and travel days clear.

export type PlanTask = { id: string; due: Date; minsLeft: number };
export type Suggestion = { taskId: string; start: Date; mins: number };

type Opts = {
  tasks: PlanTask[];
  free: FreeBlock[];
  events: CalEvent[];
  tz: string;
  now: Date;
  /** Minutes already planned on each day (dayKey → minutes). */
  plannedByDay?: Map<string, number>;
  maxSession?: number; // longest single session
  minSession?: number; // don't bother with gaps shorter than this
  dailyCap?: number; // most planned work in one day
  dueBuffer?: number; // finish this long before the deadline
};

const MIN = 60000;

export function suggestPlan(o: Opts): Suggestion[] {
  const maxSession = o.maxSession ?? 90;
  const minSession = o.minSession ?? 30;
  const dailyCap = o.dailyCap ?? 180;
  const dueBuffer = o.dueBuffer ?? 60;
  const day = (d: Date) => dayKey(localDay(d, o.tz));

  // Game and travel days stay clear, and so does the evening before a game.
  const blockedDays = new Set<string>();
  const eveningBefore = new Set<string>();
  for (const e of o.events) {
    if (e.kind !== "game" && e.kind !== "travel") continue;
    blockedDays.add(day(e.start));
    if (e.kind === "game") eveningBefore.add(day(new Date(e.start.getTime() - 24 * 3600000)));
  }

  // Open slots we can still fill, earliest first.
  const slots = o.free
    .map((f) => ({ start: Math.max(f.start.getTime(), o.now.getTime()), end: f.end.getTime() }))
    .filter((s) => s.end - s.start >= minSession * MIN && !blockedDays.has(day(new Date(s.start))))
    .map((s) => {
      // Stop at 5pm the evening before a game.
      if (!eveningBefore.has(day(new Date(s.start)))) return s;
      const cut = s.start + (17 * 60 - localMinutes(new Date(s.start), o.tz)) * MIN;
      return { start: s.start, end: Math.min(s.end, cut) };
    })
    .filter((s) => s.end - s.start >= minSession * MIN)
    .sort((a, b) => a.start - b.start);

  const used = new Map(o.plannedByDay ?? []);
  const out: Suggestion[] = [];
  const startOfToday = o.now.getTime();

  // Soonest deadline first. Each session goes on the lightest day before the deadline
  // (earlier days win ties), one session per task per day when possible, with a
  // 15-minute break after it.
  const tasks = [...o.tasks].filter((t) => t.minsLeft >= 15).sort((a, b) => a.due.getTime() - b.due.getTime());
  for (const t of tasks) {
    let left = t.minsLeft;
    const latestEnd = t.due.getTime() - dueBuffer * MIN;
    for (const oneADay of [true, false]) {
      const daysUsed = new Set<string>();
      while (left > 0) {
        let best: { i: number; start: number; mins: number; score: number } | null = null;
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          const k = day(new Date(s.start));
          if (oneADay && daysUsed.has(k)) continue;
          const room = dailyCap - (used.get(k) ?? 0);
          const end = Math.min(s.end, latestEnd);
          // A short break after whatever came before, when the gap has room for it.
          const lead = end - s.start >= (Math.min(left, maxSession) + 30) * MIN ? 15 * MIN : 0;
          const start = s.start + lead;
          const fit = Math.floor((end - start) / MIN / 15) * 15;
          let mins = Math.min(left, maxSession, fit, room);
          // Don't leave a scrap smaller than a real session for later.
          if (left - mins > 0 && left - mins < minSession) mins = left - minSession;
          if (mins < Math.min(minSession, left)) continue;
          const daysOut = (start - startOfToday) / 86400000;
          // Lighter days first, then earlier days, and gaps big enough for a full session.
          const score = (used.get(k) ?? 0) + daysOut * 20 + (Math.min(left, maxSession) - mins) * 3;
          if (!best || score < best.score) best = { i, start, mins, score };
        }
        if (!best) break;
        const s = slots[best.i];
        const k = day(new Date(best.start));
        out.push({ taskId: t.id, start: new Date(best.start), mins: best.mins });
        left -= best.mins;
        used.set(k, (used.get(k) ?? 0) + best.mins);
        daysUsed.add(k);
        const rest = { start: best.start + (best.mins + 15) * MIN, end: s.end };
        slots.splice(best.i, 1, ...(rest.end - rest.start >= minSession * MIN ? [rest] : []));
      }
      if (left <= 0) break;
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
