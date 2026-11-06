import { classify } from "./classify";
import { fetchFeed } from "./ics";
import { atLocal, localDay } from "./time";
import type { CalEvent, Task } from "./types";

/** Rough hours to plan for a Canvas item, from its title. Editable later. */
export function estimateHours(title: string): number {
  if (/\b(final|midterm|exam|test)\b/i.test(title)) return 6;
  if (/\b(paper|essay|project|draft)\b/i.test(title)) return 4;
  if (/\b(problem set|pset|homework|hw|assignment|lab)\b/i.test(title)) return 3;
  if (/\b(quiz|reading|response|discussion|post)\b/i.test(title)) return 1;
  return 2;
}

/** Canvas titles look like "Problem Set 8 [MATH 21A]"; show the course first. */
export function cleanCanvasTitle(title: string): string {
  const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return m ? `${m[2]}: ${m[1]}` : title;
}

/**
 * Canvas feeds mix two things: assignments (deadlines to study for) and
 * calendar events such as lectures and sections (time already taken).
 * Canvas marks them in the UID: "event-assignment-…" vs "event-calendar-event-…".
 */
export function isCanvasCalendarEvent(uid: string | undefined, allDay: boolean, start: Date, end: Date): boolean {
  if (uid && /calendar-event/i.test(uid)) return true;
  if (uid && /assignment|quiz|discussion/i.test(uid)) return false;
  // No telling UID: a timed item with real length is a class, a zero-length one a deadline.
  return !allDay && end.getTime() - start.getTime() >= 15 * 60000;
}

/** Upcoming assignments and class events from a Canvas calendar feed (Canvas > Calendar > Calendar Feed). */
export async function canvasFeed(feedUrl: string, from: Date, to: Date, tz: string): Promise<{ tasks: Task[]; events: CalEvent[] }> {
  const items = await fetchFeed(feedUrl, from, to);
  const events: CalEvent[] = items
    .filter((it) => isCanvasCalendarEvent(it.uid, it.allDay, it.start, it.end))
    .map((it) => ({ id: `canvas-${it.uid}`, title: cleanCanvasTitle(it.title), start: it.start, end: it.end, kind: "class" as const, allDay: it.allDay }));
  const tasks = items.filter((it) => !isCanvasCalendarEvent(it.uid, it.allDay, it.start, it.end)).map((it) => {
    // All-day Canvas items are due by the end of that day.
    const due = it.allDay ? atLocal(localDay(new Date(it.start.getTime() + 12 * 3600000), "UTC"), 23 * 60 + 59, tz) : it.end;
    return { id: `canvas-${it.uid}`, title: cleanCanvasTitle(it.title), due, hours: estimateHours(it.title), source: "canvas" as const };
  });
  return { tasks, events };
}

/** Team schedule from a Teamworks (or any) calendar feed link. */
export async function feedEvents(feedUrl: string, from: Date, to: Date): Promise<CalEvent[]> {
  const items = await fetchFeed(feedUrl, from, to);
  return items.map((it) => ({ id: `feed-${it.uid}`, title: it.title, start: it.start, end: it.end, kind: classify(it.title), allDay: it.allDay }));
}
