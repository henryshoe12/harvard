import { NEEDS_RECOVERY } from "./classify";
import { addDays, atLocal, dayKey, MIN, parseClock, type LocalDay } from "./time";
import type { CalEvent, PlanBlock, PlanResult, Settings, Task } from "./types";

type Interval = { start: number; end: number }; // epoch ms

const BREAK_MINS = 10; // gap between two study sessions in the same free slot
const MAX_SESSIONS_PER_TASK_PER_DAY = 2;
const MAX_SHIFT_MINS = 180;
const PREP_MINS = 30; // time between waking up and the first event
const MORNING_MINS = 30; // no study right after waking up
const WIND_DOWN_MINS = 30; // no study right before bed
const BEFORE_EVENT_MINS = 15; // time to get to practice or class

/**
 * Builds a week plan.
 *
 * 1. Sleep is placed first: bedtime to the next morning's wake time, every night.
 *    An early event moves that night earlier instead of cutting it short.
 * 2. Fixed events (practice, lifts, class, travel) are busy time; lifts,
 *    practices and games also get a recovery buffer after them.
 * 3. Study sessions fill what is left, earliest deadline first, never inside
 *    the sleep window and never after the task is due. Mornings, the half
 *    hour before bed and the walk to each event stay free, and no day gets
 *    more than `maxStudyMinsPerDay`.
 */
export function planWeek(opts: {
  start: LocalDay;
  days?: number;
  events: CalEvent[];
  tasks: Task[];
  settings: Settings;
  now?: Date;
}): PlanResult {
  const { start, events, tasks, settings } = opts;
  const days = opts.days ?? 7;
  const now = (opts.now ?? new Date()).getTime();
  const tz = settings.tz;
  const wake = parseClock(settings.wake);
  let bed = parseClock(settings.bedtime);
  if (bed <= wake) bed += 24 * 60; // e.g. bedtime "00:30" is after midnight

  const blocks: PlanBlock[] = [];
  const sleepConflicts: PlanResult["sleepConflicts"] = [];

  // Busy time from the calendar, with recovery after hard sessions.
  const busy: Interval[] = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const pad = NEEDS_RECOVERY.includes(e.kind) ? settings.recoveryMins * MIN : 0;
      return { start: e.start.getTime() - BEFORE_EVENT_MINS * MIN, end: e.end.getTime() + pad };
    });

  // Nights first. Night i runs from bedtime on day i to wake on day i+1.
  // If something starts before the normal wake time (a 6am lift), the whole
  // night moves earlier so the athlete still gets the same hours of sleep.
  const night = (i: number): Interval => {
    const day = addDays(start, i);
    let s = atLocal(day, bed, tz).getTime();
    let e = atLocal(addDays(day, 1), wake, tz).getTime();
    const midnight = atLocal(addDays(day, 1), 0, tz).getTime();
    const firstMorning = events
      .filter((ev) => !ev.allDay && ev.start.getTime() >= midnight && ev.start.getTime() < e + PREP_MINS * MIN)
      .reduce((min, ev) => Math.min(min, ev.start.getTime()), Infinity);
    if (firstMorning !== Infinity) {
      // Capped: a 3am flight can't move bedtime to the afternoon; it shows as a conflict instead.
      const shift = Math.min(e - (firstMorning - PREP_MINS * MIN), MAX_SHIFT_MINS * MIN);
      if (shift > 0) {
        s -= shift;
        e -= shift;
      }
    }
    return { start: s, end: e };
  };

  const free: (Interval & { day: string })[] = [];
  // Sunday night before the week, so Monday morning shows its sleep too.
  const n0 = night(-1);
  blocks.push({ kind: "sleep", title: "Sleep", start: new Date(n0.start), end: new Date(n0.end) });
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const n = night(i);
    const early = n.end < atLocal(addDays(day, 1), wake, tz).getTime();
    blocks.push({ kind: "sleep", title: early ? "Sleep (early start tomorrow)" : "Sleep", start: new Date(n.start), end: new Date(n.end) });
    for (const e of events) {
      if (!e.allDay && e.start.getTime() < n.end && e.end.getTime() > n.start) {
        sleepConflicts.push({ day: dayKey(day), event: e.title });
      }
    }

    let slots: Interval[] = [{ start: Math.max(night(i - 1).end + MORNING_MINS * MIN, now), end: n.start - WIND_DOWN_MINS * MIN }];
    for (const b of busy) slots = subtract(slots, b);
    for (const s of slots) free.push({ ...s, day: dayKey(day) });
  }
  free.sort((a, b) => a.start - b.start);
  const windowEnd = atLocal(addDays(start, days), wake, tz).getTime();

  // Earliest deadline first.
  const shortfalls: PlanResult["shortfalls"] = [];
  const dayLoad = new Map<string, number>(); // study minutes already placed per day
  const ordered = [...tasks].sort((a, b) => a.due.getTime() - b.due.getTime());
  for (const task of ordered) {
    let remaining = Math.round(task.hours * 60);
    const perDay = new Map<string, number>();
    const due = task.due.getTime();
    if (due <= now) continue; // already past due: nothing left to plan

    for (const slot of free) {
      if (remaining <= 0) break;
      if ((perDay.get(slot.day) ?? 0) >= MAX_SESSIONS_PER_TASK_PER_DAY) continue;
      const usableEnd = Math.min(slot.end, due);
      const dayLeft = settings.maxStudyMinsPerDay - (dayLoad.get(slot.day) ?? 0);
      const room = Math.min((usableEnd - slot.start) / MIN, dayLeft);
      if (room < settings.minSessionMins) continue;

      let len = Math.min(remaining, settings.maxSessionMins, room);
      // Don't leave a leftover too small to ever schedule.
      if (remaining - len > 0 && remaining - len < settings.minSessionMins) {
        len = Math.max(settings.minSessionMins, remaining - settings.minSessionMins);
        len = Math.min(len, room);
      }
      const sStart = slot.start;
      const sEnd = sStart + len * MIN;
      blocks.push({ kind: "study", title: task.title, start: new Date(sStart), end: new Date(sEnd), taskId: task.id });
      remaining -= len;
      perDay.set(slot.day, (perDay.get(slot.day) ?? 0) + 1);
      dayLoad.set(slot.day, (dayLoad.get(slot.day) ?? 0) + len);
      slot.start = sEnd + BREAK_MINS * MIN;
    }
    // A task due after this week can still be finished next week.
    if (remaining > 0 && due <= windowEnd) shortfalls.push({ taskId: task.id, title: task.title, missingMins: remaining });
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { blocks, shortfalls, sleepConflicts };
}

/** Removes `cut` from each interval. */
function subtract(slots: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const s of slots) {
    if (cut.end <= s.start || cut.start >= s.end) {
      out.push(s);
      continue;
    }
    if (cut.start > s.start) out.push({ start: s.start, end: cut.start });
    if (cut.end < s.end) out.push({ start: cut.end, end: s.end });
  }
  return out;
}
