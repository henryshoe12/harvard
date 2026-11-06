import ical, { type VEvent } from "node-ical";

/**
 * Calendar feed links (Teamworks, Canvas, any .ics subscription link) work
 * without Google sign-in. That matters because many schools, Harvard
 * included, block new apps from reading student Google accounts.
 */

export type FeedItem = { uid: string; title: string; start: Date; end: Date; allDay: boolean };

/** Only public https hosts: the server fetches this URL, so no IPs or internal names. */
export function checkFeedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:/i, "https:"));
  } catch {
    throw new Error("That isn't a valid link.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    /(^|\.)(localhost|local|internal|lan)$/.test(host)
  ) {
    throw new Error("Calendar links must be public https links.");
  }
  return url;
}

export async function fetchFeed(raw: string, from: Date, to: Date): Promise<FeedItem[]> {
  const url = checkFeedUrl(raw);
  const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`the calendar link returned an error (${res.status})`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that link isn't a calendar feed");
  return parseFeed(text, from, to);
}

export function parseFeed(text: string, from: Date, to: Date): FeedItem[] {
  const data = ical.sync.parseICS(text);
  const out: FeedItem[] = [];
  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as VEvent;
    if (ev.status === "CANCELLED") continue;
    const title = text_(ev.summary) || "(busy)";
    const allDay = ev.datetype === "date";
    const start = new Date(ev.start);
    const end = ev.end ? new Date(ev.end) : start;
    const length = end.getTime() - start.getTime();

    if (ev.rrule) {
      // Weekly practices and lifts usually arrive as one repeating event.
      const excluded = new Set(Object.values(ev.exdate ?? {}).map((d) => new Date(d as Date).getTime()));
      const lookback = new Date(from.getTime() - Math.max(length, 0));
      for (const occ of ev.rrule.between(lookback, to, true)) {
        if (excluded.has(occ.getTime())) continue;
        const override = ev.recurrences?.[occ.toISOString().slice(0, 10)];
        const s = override ? new Date(override.start) : occ;
        const e = override?.end ? new Date(override.end) : new Date(occ.getTime() + length);
        if (e > from && s < to) out.push({ uid: `${ev.uid}-${s.getTime()}`, title: override ? text_(override.summary) || title : title, start: s, end: e, allDay });
      }
    } else if (end >= from && start < to) {
      out.push({ uid: ev.uid, title, start, end, allDay });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function text_(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val);
  return "";
}
