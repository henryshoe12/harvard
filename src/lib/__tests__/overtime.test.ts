import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import { demoEvents } from "../demo";
import { freeTime, hoursIn } from "../freetime";
import { atLocal, localMinutes, parseClock } from "../time";
import { DEFAULT_SETTINGS } from "../types";

const tz = DEFAULT_SETTINGS.tz;
const monday = { y: 2026, m: 11, d: 9 };
const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end;

describe("time helpers", () => {
  it("converts local wall clock to the right instant across DST", () => {
    expect(atLocal(monday, parseClock("07:00"), tz).toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(atLocal({ y: 2026, m: 7, d: 1 }, parseClock("07:00"), tz).toISOString()).toBe("2026-07-01T11:00:00.000Z");
  });
});

describe("classify", () => {
  it("recognises athlete calendar events", () => {
    expect(classify("Lift")).toBe("lift");
    expect(classify("Practice")).toBe("practice");
    expect(classify("Travel to Penn (bus)")).toBe("travel");
    expect(classify("Game vs Penn")).toBe("game");
    expect(classify("MATH 21A lecture")).toBe("class");
    expect(classify("Film")).toBe("film");
    expect(classify("Dinner with Sam")).toBe("other");
  });
});

describe("freeTime", () => {
  const events = demoEvents(monday, tz);
  const free = freeTime({ start: monday, events, tz, dayStart: "07:00", dayEnd: "23:00" });

  it("never overlaps the fixed schedule", () => {
    for (const f of free) for (const e of events) expect(overlaps(f, e)).toBe(false);
  });

  it("stays inside the athlete's day and skips gaps under 30 minutes", () => {
    for (const f of free) {
      expect(localMinutes(f.start, tz)).toBeGreaterThanOrEqual(parseClock("07:00"));
      const endMins = localMinutes(f.end, tz) || 24 * 60;
      expect(endMins).toBeLessThanOrEqual(parseClock("23:00"));
      expect(f.end.getTime() - f.start.getTime()).toBeGreaterThanOrEqual(30 * 60000);
    }
  });

  it("finds the real gaps on a game day", () => {
    // Saturday: meeting 8-11, game 12-3:30, bus 4:30-10. Free: 7-8, 11-12, 3:30-4:30, 10-11pm.
    const sat = free.filter((f) => f.day === "2026-11-14").map((f) => [localMinutes(f.start, tz), localMinutes(f.end, tz)]);
    expect(sat).toEqual([
      [7 * 60, 8 * 60],
      [11 * 60, 12 * 60],
      [15 * 60 + 30, 16 * 60 + 30],
      [22 * 60, 23 * 60],
    ]);
  });

  it("counts only the hours still ahead", () => {
    const blocks = [{ start: new Date("2026-11-09T12:00:00Z"), end: new Date("2026-11-09T16:00:00Z") }];
    expect(hoursIn(blocks)).toBe(4);
    expect(hoursIn(blocks, new Date("2026-11-09T15:00:00Z"))).toBe(1);
  });

  it("handles a day that ends after midnight", () => {
    const late = freeTime({ start: monday, days: 1, events: [], tz, dayStart: "08:00", dayEnd: "01:00" });
    expect(hoursIn(late)).toBe(17);
  });
});

describe("Canvas", () => {
  it("puts the course first in titles", async () => {
    const { cleanCanvasTitle } = await import("../canvas");
    expect(cleanCanvasTitle("Problem Set 8 [MATH 21A]")).toBe("MATH 21A: Problem Set 8");
    expect(cleanCanvasTitle("Lift")).toBe("Lift");
  });

  it("treats lectures as class time and assignments as deadlines", async () => {
    const { isCanvasCalendarEvent } = await import("../canvas");
    const t = new Date("2026-11-03T18:00:00Z");
    const later = new Date("2026-11-03T19:15:00Z");
    expect(isCanvasCalendarEvent("event-calendar-event-123", false, t, later)).toBe(true);
    expect(isCanvasCalendarEvent("event-assignment-456", false, t, t)).toBe(false);
    expect(isCanvasCalendarEvent(undefined, false, t, later)).toBe(true);
    expect(isCanvasCalendarEvent(undefined, false, t, t)).toBe(false);
  });
});

describe("calendar feed links", () => {
  it("expands weekly repeating practices and skips cancelled dates", async () => {
    const { parseFeed } = await import("../ics");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "BEGIN:VEVENT", "UID:prac", "SUMMARY:Practice",
      "DTSTART:20261102T200000Z", "DTEND:20261102T230000Z",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE:20261111T200000Z",
      "END:VEVENT",
      "BEGIN:VEVENT", "UID:one", "SUMMARY:Travel to Penn",
      "DTSTART:20261113T200000Z", "DTEND:20261114T020000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const items = parseFeed(ics, new Date("2026-11-09T05:00:00Z"), new Date("2026-11-16T05:00:00Z"));
    expect(items.map((i) => [i.title, i.start.toISOString()])).toEqual([
      ["Practice", "2026-11-09T20:00:00.000Z"],
      ["Travel to Penn", "2026-11-13T20:00:00.000Z"],
    ]);
  });

  it("only accepts public https links", async () => {
    const { checkFeedUrl } = await import("../ics");
    expect(checkFeedUrl("webcal://canvas.harvard.edu/feeds/calendars/user_x.ics").href).toBe("https://canvas.harvard.edu/feeds/calendars/user_x.ics");
    for (const bad of ["http://example.com/a.ics", "https://127.0.0.1/a.ics", "https://localhost/a.ics", "https://[::1]/a.ics", "not a url"]) {
      expect(() => checkFeedUrl(bad)).toThrow();
    }
  });
});
