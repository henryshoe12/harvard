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

/** Upcoming assignments from a Canvas calendar feed (Canvas > Calendar > Calendar Feed). */
export async function canvasTasks(feedUrl: string, from: Date, to: Date, tz: string): Promise<Task[]> {
  const items = await fetchFeed(feedUrl, from, to);
  return items.map((it) => {
    // All-day Canvas items are due by the end of that day.
    const due = it.allDay ? atLocal(localDay(new Date(it.start.getTime() + 12 * 3600000), "UTC"), 23 * 60 + 59, tz) : it.end;
    return { id: `canvas-${it.uid}`, title: cleanCanvasTitle(it.title), due, hours: estimateHours(it.title), source: "canvas" as const };
  });
}

/** Team schedule from a Teamworks (or any) calendar feed link. */
export async function feedEvents(feedUrl: string, from: Date, to: Date): Promise<CalEvent[]> {
  const items = await fetchFeed(feedUrl, from, to);
  return items.map((it) => ({ id: `feed-${it.uid}`, title: it.title, start: it.start, end: it.end, kind: classify(it.title), allDay: it.allDay }));
}
