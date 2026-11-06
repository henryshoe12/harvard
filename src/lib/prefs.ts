import { cookies } from "next/headers";
import { DEFAULT_SETTINGS, type Settings, type Task } from "./types";

// v1 keeps each athlete's preferences and manual tasks in their own
// httpOnly cookies. Moving these to a database (Supabase) comes with team
// accounts; nothing else in the app needs to change when that happens.

export type Prefs = { settings: Settings; canvasUrl: string; teamUrl: string; tasks: Task[]; work: WorkPrefs };

/** The athlete's own time estimates and what they've finished, by task id. */
export type WorkPrefs = { est: Record<string, number>; done: string[] };

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function readPrefs(): Promise<Prefs> {
  const jar = await cookies();
  let settings = DEFAULT_SETTINGS;
  let canvasUrl = "";
  let teamUrl = "";
  let tasks: Task[] = [];
  try {
    const raw = JSON.parse(jar.get("ot_settings")?.value ?? "{}");
    settings = { ...DEFAULT_SETTINGS, ...pick(raw) };
    canvasUrl = typeof raw.canvasUrl === "string" ? raw.canvasUrl : "";
    teamUrl = typeof raw.teamUrl === "string" ? raw.teamUrl : "";
  } catch {}
  try {
    const raw = JSON.parse(jar.get("ot_tasks")?.value ?? "[]");
    if (Array.isArray(raw)) {
      tasks = raw
        .filter((t) => t && typeof t.title === "string" && typeof t.due === "string" && typeof t.hours === "number")
        .map((t) => ({ id: String(t.id), title: t.title, due: new Date(t.due), hours: t.hours, source: "manual" as const }));
    }
  } catch {}
  return { settings, canvasUrl, teamUrl, tasks, work: await readWork() };
}

async function readWork(): Promise<WorkPrefs> {
  const jar = await cookies();
  try {
    const raw = JSON.parse(jar.get("ot_work")?.value ?? "{}");
    const est: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.est ?? {})) if (typeof v === "number" && v >= 0 && v <= 100) est[k] = v;
    const done = Array.isArray(raw.done) ? raw.done.filter((x: unknown) => typeof x === "string") : [];
    return { est, done };
  } catch {
    return { est: {}, done: [] };
  }
}

export async function writeWork(work: WorkPrefs) {
  const jar = await cookies();
  // Keep the cookie small: the most recent 80 entries of each.
  const est = Object.fromEntries(Object.entries(work.est).slice(-80));
  const done = work.done.slice(-80);
  jar.set("ot_work", JSON.stringify({ est, done }), { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
}

export async function writeSettings(s: Partial<Settings> & { canvasUrl?: string; teamUrl?: string }) {
  const jar = await cookies();
  const current = await readPrefs();
  const next = {
    ...pick({ ...current.settings, ...s }),
    canvasUrl: s.canvasUrl ?? current.canvasUrl,
    teamUrl: s.teamUrl ?? current.teamUrl,
  };
  jar.set("ot_settings", JSON.stringify(next), { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
}

export async function writeTasks(tasks: Task[]) {
  const jar = await cookies();
  const raw = tasks.slice(-30).map((t) => ({ id: t.id, title: t.title.slice(0, 120), due: t.due.toISOString(), hours: t.hours }));
  jar.set("ot_tasks", JSON.stringify(raw), { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function pick(raw: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (typeof raw.bedtime === "string" && CLOCK.test(raw.bedtime)) out.bedtime = raw.bedtime;
  if (typeof raw.wake === "string" && CLOCK.test(raw.wake)) out.wake = raw.wake;
  if (typeof raw.tz === "string") {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: raw.tz });
      out.tz = raw.tz;
    } catch {}
  }
  return out;
}
