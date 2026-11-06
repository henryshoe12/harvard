export type EventKind =
  | "practice"
  | "lift"
  | "film"
  | "treatment"
  | "travel"
  | "game"
  | "class"
  | "meeting"
  | "other";

/** Something already on the calendar: part of the fixed schedule. */
export type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kind: EventKind;
  allDay?: boolean;
};

/** Schoolwork with a deadline and a rough time estimate. */
export type Task = {
  id: string;
  title: string;
  due: Date;
  hours: number;
  source?: "canvas" | "manual";
};

export type Settings = {
  tz: string;
  /** When the athlete's day ends: free time isn't counted after this. */
  bedtime: string; // "23:00"
  /** When the athlete's day starts: free time isn't counted before this. */
  wake: string; // "07:00"
};

export const DEFAULT_SETTINGS: Settings = {
  tz: "America/New_York",
  bedtime: "23:00",
  wake: "07:00",
};
