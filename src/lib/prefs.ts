import { cookies } from "next/headers";
import { DEFAULT_SETTINGS, type Settings, type Task } from "./types";

// v1 keeps each athlete's preferences and manual tasks in their own
// httpOnly cookies. Moving these to a database (Supabase) comes with team
// accounts; nothing else in the app needs to change when that happens.

export type Prefs = { settings: Settings; canvasUrl: string; tasks: Task[] };

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function readPrefs(): Promise<Prefs> {
  const jar = await cookies();
  let settings = DEFAULT_SETTINGS;
  let canvasUrl = "";
  let tasks: Task[] = [];
  try {
    const raw = JSON.parse(jar.get("ot_settings")?.value ?? "{}");
    settings = { ...DEFAULT_SETTINGS, ...pick(raw) };
    canvasUrl = typeof raw.canvasUrl === "string" ? raw.canvasUrl : "";
  } catch {}
  try {
    const raw = JSON.parse(jar.get("ot_tasks")?.value ?? "[]");
    if (Array.isArray(raw)) {
      tasks = raw
        .filter((t) => t && typeof t.title === "string" && typeof t.due === "string" && typeof t.hours === "number")
        .map((t) => ({ id: String(t.id), title: t.title, due: new Date(t.due), hours: t.hours, source: "manual" as const }));
    }
  } catch {}
  return { settings, canvasUrl, tasks };
}

export async function writeSettings(s: Partial<Settings> & { canvasUrl?: string }) {
  const jar = await cookies();
  const current = await readPrefs();
  const next = { ...pick({ ...current.settings, ...s }), canvasUrl: s.canvasUrl ?? current.canvasUrl };
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
  for (const k of ["recoveryMins", "maxSessionMins", "minSessionMins", "maxStudyMinsPerDay"] as const) {
    const v = Number(raw[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 600) out[k] = v;
  }
  return out;
}
