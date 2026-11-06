import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import { demoEvents, demoTasks } from "../demo";
import { planWeek } from "../planner";
import { atLocal, dayKey, localDay, localMinutes, parseClock } from "../time";
import { DEFAULT_SETTINGS, type CalEvent } from "../types";

const tz = DEFAULT_SETTINGS.tz;
const monday = { y: 2026, m: 11, d: 9 };
const before = new Date("2026-11-01T00:00:00Z"); // "now" before the week starts

const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) =>
  a.start < b.end && b.start < a.end;

describe("time helpers", () => {
  it("converts local wall clock to the right instant across DST", () => {
    // Nov 9 2026 is EST (UTC-5).
    expect(atLocal(monday, parseClock("07:00"), tz).toISOString()).toBe("2026-11-09T12:00:00.000Z");
    // Jul 1 2026 is EDT (UTC-4).
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

describe("planWeek", () => {
  const events = demoEvents(monday, tz);
  const tasks = demoTasks(monday, tz);
  const plan = planWeek({ start: monday, events, tasks, settings: DEFAULT_SETTINGS, now: before });
  const study = plan.blocks.filter((b) => b.kind === "study");
  const sleep = plan.blocks.filter((b) => b.kind === "sleep");

  it("protects a sleep block every night", () => {
    expect(sleep).toHaveLength(8); // the night before Monday, then one per day
    for (const s of sleep) {
      expect((s.end.getTime() - s.start.getTime()) / 60000).toBe(8 * 60);
    }
    // Normal nights run 11pm to 7am (Monday's 7am lift moves Sunday night; Monday night is normal).
    expect(localMinutes(sleep[1].start, tz)).toBe(parseClock("23:00"));
    expect(localMinutes(sleep[1].end, tz)).toBe(parseClock("07:00"));
  });

  it("moves bedtime earlier before a 6am lift instead of cutting sleep", () => {
    // Wednesday night, before Thursday's 6:00 lift: wake 5:30, so bed 21:30.
    const wed = sleep[3];
    expect(localMinutes(wed.start, tz)).toBe(parseClock("21:30"));
    expect(localMinutes(wed.end, tz)).toBe(parseClock("05:30"));
    expect(wed.title).toMatch(/early start/);
  });

  it("never schedules study during sleep or fixed events", () => {
    for (const b of study) {
      for (const s of sleep) expect(overlaps(b, s)).toBe(false);
      for (const e of events) expect(overlaps(b, e)).toBe(false);
    }
  });

  it("keeps recovery time after lifts and practice", () => {
    for (const e of events.filter((x) => x.kind === "lift" || x.kind === "practice")) {
      const recovery = { start: e.end, end: new Date(e.end.getTime() + 45 * 60000) };
      for (const b of study) expect(overlaps(b, recovery)).toBe(false);
    }
  });

  it("finishes every task before it is due", () => {
    for (const t of tasks) {
      const blocks = study.filter((b) => b.taskId === t.id);
      for (const b of blocks) expect(b.end.getTime()).toBeLessThanOrEqual(t.due.getTime());
      if (t.due < atLocal({ y: 2026, m: 11, d: 16 }, parseClock("07:00"), tz)) {
        const mins = blocks.reduce((n, b) => n + (b.end.getTime() - b.start.getTime()) / 60000, 0);
        expect(mins).toBe(t.hours * 60);
      }
    }
    expect(plan.shortfalls).toEqual([]);
  });

  it("caps sessions at 90 minutes and two per task per day", () => {
    const perDay = new Map<string, number>();
    for (const b of study) {
      expect((b.end.getTime() - b.start.getTime()) / 60000).toBeLessThanOrEqual(90);
      const key = `${b.taskId}-${dayKey(localDay(b.start, tz))}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it("flags travel that runs into the sleep window", () => {
    expect(plan.sleepConflicts).toEqual([]);
    const late: CalEvent = {
      id: "x", title: "Bus home", kind: "travel",
      start: atLocal(monday, parseClock("21:00"), tz),
      end: atLocal(monday, parseClock("23:45"), tz),
    };
    const p2 = planWeek({ start: monday, events: [late], tasks: [], settings: DEFAULT_SETTINGS, now: before });
    expect(p2.sleepConflicts).toEqual([{ day: "2026-11-09", event: "Bus home" }]);
  });

  it("reports work that cannot fit before the deadline", () => {
    const crunch = {
      id: "c", title: "Huge paper", hours: 40,
      due: atLocal({ y: 2026, m: 11, d: 10 }, parseClock("12:00"), tz),
    };
    const p3 = planWeek({ start: monday, events, tasks: [crunch], settings: DEFAULT_SETTINGS, now: before });
    expect(p3.shortfalls).toHaveLength(1);
    expect(p3.shortfalls[0].missingMins).toBeGreaterThan(0);
  });

  it("keeps the day humane: no more than 4 hours of study, nothing in the last 30 minutes before bed", () => {
    const load = new Map<string, number>();
    for (const b of study) {
      const k = dayKey(localDay(b.start, tz));
      load.set(k, (load.get(k) ?? 0) + (b.end.getTime() - b.start.getTime()) / 60000);
      for (const s of sleep) {
        const windDown = { start: new Date(s.start.getTime() - 30 * 60000), end: s.start };
        expect(overlaps(b, windDown)).toBe(false);
      }
    }
    for (const mins of load.values()) expect(mins).toBeLessThanOrEqual(240);
  });

  it("does not schedule in the past", () => {
    const now = atLocal({ y: 2026, m: 11, d: 12 }, parseClock("12:00"), tz);
    const p4 = planWeek({ start: monday, events, tasks, settings: DEFAULT_SETTINGS, now });
    for (const b of p4.blocks.filter((x) => x.kind === "study")) expect(b.start >= now).toBe(true);
  });
});

describe("Canvas titles", () => {
  it("puts the course first", async () => {
    const { cleanCanvasTitle } = await import("../canvas");
    expect(cleanCanvasTitle("Problem Set 8 [MATH 21A]")).toBe("MATH 21A: Problem Set 8");
    expect(cleanCanvasTitle("Lift")).toBe("Lift");
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
