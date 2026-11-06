import { classify } from "./classify";
import { estimateHours } from "./canvas";
import { atLocal, parseDayKey } from "./time";
import type { CalEvent, Task } from "./types";

type GEvent = {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

/**
 * Everything on the athlete's selected Google calendars between two instants.
 * Team schedules (Teamworks) and Canvas both usually arrive as subscribed
 * calendars, so we read every calendar the athlete has turned on.
 *
 * Canvas items are deadlines, not busy time: anything from a Canvas calendar
 * (or linking back to Canvas) becomes a task to study for instead of an event.
 */
export async function listCalendar(accessToken: string, from: Date, to: Date, tz: string): Promise<{ events: CalEvent[]; tasks: Task[] }> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const list = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", { headers, cache: "no-store" });
  if (!list.ok) throw new Error(`Google Calendar error ${list.status}`);
  const calendars: { id: string; summary?: string; selected?: boolean }[] = (await list.json()).items ?? [];
  const selected = calendars.filter((c) => c.selected !== false);

  const all = await Promise.all(
    selected.map(async (cal) => {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`, { headers, cache: "no-store" });
      if (!res.ok) return [];
      const isCanvas = CANVAS.test(`${cal.summary ?? ""} ${cal.id}`);
      return ((await res.json()).items ?? []).map((e: GEvent) => ({ ...e, isCanvas }));
    }),
  );

  const seen = new Set<string>();
  const events: CalEvent[] = [];
  const tasks: Task[] = [];
  for (const e of all.flat() as (GEvent & { isCanvas: boolean })[]) {
    if (e.status === "cancelled" || seen.has(e.id)) continue;
    seen.add(e.id);
    const title = e.summary ?? "(busy)";
    const allDay = !e.start.dateTime;
    const end = e.end.dateTime ? new Date(e.end.dateTime) : null;

    if (e.isCanvas || CANVAS.test(`${e.description ?? ""} ${e.location ?? ""}`)) {
      // All-day Canvas items are due by the end of that day.
      const due = end ?? atLocal(parseDayKey(e.start.date!), 23 * 60 + 59, tz);
      tasks.push({ id: `gcal-${e.id}`, title: cleanCanvasTitle(title), due, hours: estimateHours(title), source: "canvas" });
      continue;
    }
    if (e.transparency === "transparent") continue; // "free" events don't block time
    events.push({
      id: e.id,
      title,
      start: new Date(e.start.dateTime ?? `${e.start.date}T00:00:00`),
      end: end ?? new Date(`${e.end.date}T00:00:00`),
      kind: classify(title),
      allDay,
    });
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, tasks };
}

const CANVAS = /canvas|instructure/i;

/** Canvas titles look like "Problem Set 8 [MATH 21A]"; show the course first. */
export function cleanCanvasTitle(title: string): string {
  const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return m ? `${m[2]}: ${m[1]}` : title;
}
