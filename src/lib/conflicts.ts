import type { CalEvent, Task } from "./types";

const HOUR = 3600000;

/** Course code from a title: "MATH 21A lecture", "MATH 21A: Problem Set 8", "EC10 section" → "MATH 21A", "EC 10". */
export function courseOf(title: string): string | null {
  const m = title.match(/\b([A-Z]{2,8})\s?(\d{1,4}[A-Z]{0,2})\b/);
  if (m) return `${m[1]} ${m[2]}`;
  const lead = title.match(/^([A-Za-z][A-Za-z&]+)\b/);
  // "Expos draft 2" → "Expos": a short leading word is usually the course nickname.
  return lead && !/^(study|read|finish|review|prep|start)$/i.test(lead[1]) ? lead[1] : null;
}

/** Same course, however it's written: "MATH 21A", "math21a", "Math 21a". */
export function courseKey(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Time away with the team: travel legs plus the game, merged into one window. */
export type Trip = { id: string; title: string; start: Date; end: Date; away: boolean };

/** What a trip runs into, grouped by course. */
export type Conflict = {
  trip: Trip;
  courses: { course: string; missed: CalEvent[]; due: Task[] }[];
};

/**
 * Trips from the fixed schedule. Travel legs within 30 hours of each other (and any game
 * between them) are one trip. A game with no travel is still time away from class.
 */
export function findTrips(events: CalEvent[]): Trip[] {
  const legs = events.filter((e) => e.kind === "travel" || e.kind === "game").sort((a, b) => a.start.getTime() - b.start.getTime());
  const trips: (Trip & { parts: CalEvent[] })[] = [];
  for (const e of legs) {
    const last = trips[trips.length - 1];
    const linked = last && (last.away || e.kind === "travel") && e.start.getTime() - last.end.getTime() <= 30 * HOUR;
    if (last && (linked || e.start < last.end)) {
      if (e.end > last.end) last.end = e.end;
      last.parts.push(e);
      if (e.kind === "travel") last.away = true;
    } else {
      trips.push({ id: e.id, title: "", start: e.start, end: e.end, away: e.kind === "travel", parts: [e] });
    }
  }
  return trips.map(({ parts, ...t }) => {
    const game = parts.find((p) => p.kind === "game");
    return { ...t, title: (game ?? parts[0]).title };
  });
}

/** Opponent or place for an email subject: "Game vs Penn" → "Penn", "Travel to Penn (bus)" → "Penn". */
export function tripName(trip: Trip): string {
  const m = trip.title.match(/(?:\bvs\.?|\bat|@|\bto)\s+([A-Z][\w.'&-]*(?:\s+[A-Z][\w.'&-]*)*)/);
  return m ? m[1] : trip.title;
}

/**
 * Classes that happen during a trip, and work due while away or within a day of
 * getting back (when there's no time to finish it on the bus).
 */
export function findConflicts(events: CalEvent[], tasks: Task[]): Conflict[] {
  const out: Conflict[] = [];
  for (const trip of findTrips(events)) {
    const missed = events.filter((e) => e.kind === "class" && !e.allDay && e.start < trip.end && e.end > trip.start);
    const dueWindowEnd = new Date(trip.end.getTime() + 24 * HOUR);
    const due = tasks.filter((t) => t.due > trip.start && t.due <= dueWindowEnd);
    if (!missed.length && !due.length) continue;
    const byCourse = new Map<string, { course: string; missed: CalEvent[]; due: Task[] }>();
    const slot = (title: string) => {
      const course = courseOf(title) ?? "Other";
      const k = courseKey(course);
      if (!byCourse.has(k)) byCourse.set(k, { course, missed: [], due: [] });
      return byCourse.get(k)!;
    };
    for (const e of missed) slot(e.title).missed.push(e);
    for (const t of due) slot(t.title).due.push(t);
    out.push({ trip, courses: [...byCourse.values()] });
  }
  return out;
}
