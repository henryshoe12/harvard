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

/** Something already on the calendar that the planner must work around. */
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
  bedtime: string; // "23:00"
  wake: string; // "07:00"
  /** Minutes of recovery kept free after a lift, practice or game. */
  recoveryMins: number;
  /** Longest single study session, in minutes. */
  maxSessionMins: number;
  /** Shortest gap worth scheduling a session in. */
  minSessionMins: number;
  /** Most study scheduled on any one day, in minutes. */
  maxStudyMinsPerDay: number;
};

export const DEFAULT_SETTINGS: Settings = {
  tz: "America/New_York",
  bedtime: "23:00",
  wake: "07:00",
  recoveryMins: 45,
  maxSessionMins: 90,
  minSessionMins: 30,
  maxStudyMinsPerDay: 240,
};

export type PlanBlock = {
  kind: "study" | "sleep";
  title: string;
  start: Date;
  end: Date;
  taskId?: string;
};

export type PlanResult = {
  blocks: PlanBlock[];
  /** Tasks the planner could not fully fit before their deadline. */
  shortfalls: { taskId: string; title: string; missingMins: number }[];
  /** Nights where fixed events run into the sleep window. */
  sleepConflicts: { day: string; event: string }[];
};
