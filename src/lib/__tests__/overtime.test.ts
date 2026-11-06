import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import { demoEvents } from "../demo";
import { freeTime, hoursIn } from "../freetime";
import { atLocal, localDay, localMinutes, parseClock } from "../time";
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

describe("travel conflicts", () => {
  it("merges travel legs and the game into one trip and finds what it runs into", async () => {
    const { demoTasks } = await import("../demo");
    const { findConflicts, findTrips, tripName } = await import("../conflicts");
    const events = demoEvents(monday, tz);
    const trips = findTrips(events);
    expect(trips).toHaveLength(1);
    expect(tripName(trips[0])).toBe("Penn");
    expect(trips[0].away).toBe(true);
    const [c] = findConflicts(events, demoTasks(monday, tz));
    const byCourse = Object.fromEntries(c.courses.map((k) => [k.course, k]));
    expect(byCourse["MATH 21A"].missed.map((m) => m.title)).toEqual(["MATH 21A lecture"]);
    expect(byCourse["EC 10"].due.map((t) => t.title)).toEqual(["EC 10 problem set 5"]);
    expect(byCourse["Expos"].due).toHaveLength(1); // due the day after getting home
    expect(byCourse["MATH 21A"].due).toHaveLength(0); // Wednesday's problem set is before the trip
  });

  it("reads course codes however they're written", async () => {
    const { courseOf, courseKey } = await import("../conflicts");
    expect(courseOf("MATH 21A: Problem Set 8")).toBe("MATH 21A");
    expect(courseOf("EC10 section")).toBe("EC 10");
    expect(courseOf("Study for midterm")).toBeNull();
    expect(courseKey("Math 21a")).toBe(courseKey("MATH 21A"));
  });
});

describe("email drafts", () => {
  it("writes a professor email naming what's missed and due", async () => {
    const { draftEmail, greeting, composeLinks } = await import("../email");
    const d = draftEmail({
      course: "EC 10",
      place: "Penn",
      away: true,
      tripStart: atLocal({ y: 2026, m: 11, d: 13 }, parseClock("10:00"), tz),
      tripEnd: atLocal({ y: 2026, m: 11, d: 14 }, parseClock("22:00"), tz),
      missed: [{ title: "EC 10 section", start: atLocal({ y: 2026, m: 11, d: 13 }, parseClock("09:00"), tz) }],
      due: [{ title: "EC 10 problem set 5", due: atLocal({ y: 2026, m: 11, d: 13 }, parseClock("17:00"), tz) }],
      tz,
      athleteName: "Henry",
      sport: "football",
      toName: "Prof. Dana Whitfield",
    });
    expect(d.subject).toBe("EC 10: away for the Penn game (Friday, Nov 13)");
    expect(d.body).toContain("Hi Professor Whitfield,");
    expect(d.body).toContain("I'm on the football team and I'll be traveling for our game at Penn from Friday, Nov 13 to Saturday, Nov 14.");
    expect(d.body).toContain("I'll miss section on Friday, Nov 13 at 9:00 AM.");
    expect(d.body).toContain("Problem set 5 (due Friday at 5:00 PM) is due");
    expect(d.body.trim().endsWith("Henry")).toBe(true);
    expect(greeting("Sam Ortiz")).toBe("Hi Sam,");
    expect(greeting("Dr. Priya Raman")).toBe("Hi Dr. Raman,");
    expect(composeLinks("a@b.edu", "Hi there", "Line 1\nLine 2").mail).toBe("mailto:a%40b.edu?subject=Hi%20there&body=Line%201%0ALine%202");
  });
});

describe("suggest a plan", () => {
  it("fits each task before it's due, spread out, and keeps game and travel days clear", async () => {
    const { suggestPlan } = await import("../suggest");
    const { demoTasks } = await import("../demo");
    const events = demoEvents(monday, tz);
    const free = freeTime({ start: monday, events, tz, dayStart: "07:00", dayEnd: "23:00" });
    const tasks = demoTasks(monday, tz).map((t) => ({ id: t.id, due: t.due, minsLeft: t.hours * 60 }));
    const now = atLocal(monday, parseClock("06:00"), tz);
    const plan = suggestPlan({ tasks, free, events, tz, now });
    const byTask = (id: string) => plan.filter((p) => p.taskId === id);
    for (const t of tasks) {
      const s = byTask(t.id);
      for (const p of s) expect(p.start.getTime() + p.mins * 60000).toBeLessThanOrEqual(t.due.getTime() - 3600000);
    }
    // 4h problem set due Wednesday night: fully planned in sessions of at most 1.5h on different days.
    const ps = byTask("t1");
    expect(ps.reduce((n, p) => n + p.mins, 0)).toBe(240);
    expect(Math.max(...ps.map((p) => p.mins))).toBeLessThanOrEqual(90);
    // Nothing on Friday (travel) or Saturday (game), and nothing overlaps a fixed event.
    for (const p of plan) {
      const d = localDay(p.start, tz).d;
      expect([13, 14]).not.toContain(d);
      const end = new Date(p.start.getTime() + p.mins * 60000);
      for (const e of events) expect(overlaps({ start: p.start, end }, e)).toBe(false);
    }
    // No two suggestions overlap.
    const sorted = [...plan].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start.getTime()).toBeGreaterThanOrEqual(sorted[i - 1].start.getTime() + sorted[i - 1].mins * 60000);
  });
});
