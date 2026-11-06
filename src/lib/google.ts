import { classify } from "./classify";
import type { CalEvent } from "./types";

type GEvent = {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

/**
 * Events from all of the athlete's selected Google calendars between two
 * instants. Team schedules are often a shared calendar, so we read every
 * calendar the athlete has turned on, not just the primary one.
 */
export async function listEvents(accessToken: string, from: Date, to: Date): Promise<CalEvent[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const list = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", { headers, cache: "no-store" });
  if (!list.ok) throw new Error(`Google Calendar error ${list.status}`);
  const calendars: { id: string; selected?: boolean }[] = (await list.json()).items ?? [];
  const ids = calendars.filter((c) => c.selected !== false).map((c) => c.id);

  const all = await Promise.all(
    ids.map(async (id) => {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${params}`, { headers, cache: "no-store" });
      if (!res.ok) return [];
      return ((await res.json()).items ?? []) as GEvent[];
    }),
  );

  const seen = new Set<string>();
  const events: CalEvent[] = [];
  for (const e of all.flat()) {
    if (e.status === "cancelled" || e.transparency === "transparent") continue; // "free" events don't block time
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const allDay = !e.start.dateTime;
    const title = e.summary ?? "(busy)";
    events.push({
      id: e.id,
      title,
      start: new Date(e.start.dateTime ?? `${e.start.date}T00:00:00`),
      end: new Date(e.end.dateTime ?? `${e.end.date}T00:00:00`),
      kind: classify(title),
      allDay,
    });
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
