import { classify } from "./classify";
import { addDays, atLocal, parseClock, type LocalDay } from "./time";
import type { CalEvent, Task } from "./types";

// A sample in-season football week, so the app can be tried before
// connecting Google Calendar. Modelled on a real Harvard schedule:
// 6am Thursday lifts, long Mondays, a Saturday road game.
const WEEK: [number, string, string, string][] = [
  // [day offset from Monday, start, end, title]
  [0, "07:00", "08:15", "Lift"],
  [0, "10:30", "11:45", "MATH 21A lecture"],
  [0, "15:00", "18:00", "Practice"],
  [0, "19:00", "21:00", "Film and position meeting"],
  [1, "09:00", "10:15", "EC 10 section"],
  [1, "14:00", "15:00", "Treatment"],
  [1, "15:30", "18:30", "Practice"],
  [2, "07:00", "08:15", "Lift"],
  [2, "10:30", "11:45", "MATH 21A lecture"],
  [2, "15:00", "18:00", "Practice"],
  [2, "19:00", "20:30", "Film"],
  [3, "06:00", "07:15", "Lift"],
  [3, "09:00", "10:15", "EC 10 section"],
  [3, "15:00", "18:00", "Practice"],
  [3, "19:00", "21:00", "Film"],
  [4, "10:30", "11:45", "MATH 21A lecture"],
  [4, "07:30", "09:00", "Walkthrough"],
  [4, "10:00", "16:00", "Travel to Penn (bus)"],
  [5, "08:00", "11:00", "Team meeting and pregame"],
  [5, "12:00", "15:30", "Game vs Penn"],
  [5, "16:30", "22:00", "Travel home (bus)"],
  [6, "11:00", "12:00", "Treatment"],
];

export function demoEvents(monday: LocalDay, tz: string): CalEvent[] {
  return WEEK.map(([off, s, e, title], i) => {
    const day = addDays(monday, off);
    return {
      id: `demo-${i}`,
      title,
      start: atLocal(day, parseClock(s), tz),
      end: atLocal(day, parseClock(e), tz),
      kind: classify(title),
    };
  });
}

export function demoTasks(monday: LocalDay, tz: string): Task[] {
  return [
    { id: "t1", title: "MATH 21A problem set 8", due: atLocal(addDays(monday, 2), parseClock("23:59"), tz), hours: 4, source: "canvas" },
    { id: "t2", title: "EC 10 reading response", due: atLocal(addDays(monday, 3), parseClock("09:00"), tz), hours: 2, source: "canvas" },
    { id: "t5", title: "EC 10 problem set 5", due: atLocal(addDays(monday, 4), parseClock("17:00"), tz), hours: 3, source: "canvas" },
    { id: "t3", title: "Study for MATH 21A midterm", due: atLocal(addDays(monday, 10), parseClock("18:00"), tz), hours: 8, source: "manual" },
    { id: "t4", title: "Expos draft 2", due: atLocal(addDays(monday, 6), parseClock("17:00"), tz), hours: 3, source: "canvas" },
  ];
}
