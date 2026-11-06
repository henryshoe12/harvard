"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { readPrefs, writeSettings, writeTasks, writeWork } from "@/lib/prefs";
import { atLocal, parseClock, parseDayKey } from "@/lib/time";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/week" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function saveSettings(form: FormData) {
  await writeSettings({
    bedtime: String(form.get("bedtime") ?? ""),
    wake: String(form.get("wake") ?? ""),
    tz: String(form.get("tz") ?? "") || undefined,
    ...(form.has("sport") ? { sport: String(form.get("sport")) } : {}),
    ...(form.has("name") ? { name: String(form.get("name")) } : {}),
    canvasUrl: form.has("canvasUrl") ? String(form.get("canvasUrl")).trim() : undefined,
    teamUrl: form.has("teamUrl") ? String(form.get("teamUrl")).trim() : undefined,
  });
  revalidatePath("/week");
}

/** Start without Google: save the Teamworks and Canvas links and open the week. */
export async function startWithLinks(form: FormData) {
  const teamUrl = String(form.get("teamUrl") ?? "").trim();
  const canvasUrl = String(form.get("canvasUrl") ?? "").trim();
  if (!teamUrl && !canvasUrl) redirect("/?error=links");
  const tz = String(form.get("tz") ?? "");
  await writeSettings({ teamUrl, canvasUrl, tz: tz || undefined });
  redirect("/week");
}

export async function addTask(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const dueDay = String(form.get("dueDay") ?? "");
  const dueTime = String(form.get("dueTime") ?? "") || "23:59";
  const hours = Number(form.get("hours"));
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDay) || !(hours > 0 && hours <= 40)) return;
  const { settings, tasks } = await readPrefs();
  const due = atLocal(parseDayKey(dueDay), parseClock(dueTime), settings.tz);
  await writeTasks([...tasks, { id: crypto.randomUUID(), title, due, hours, source: "manual" }]);
  revalidatePath("/week");
}

export async function removeTask(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { tasks } = await readPrefs();
  await writeTasks(tasks.filter((t) => t.id !== id));
  revalidatePath("/week");
}

/** Clears this browser's saved links, settings and tasks. */
export async function forgetMe() {
  const jar = await cookies();
  jar.delete("ot_settings");
  jar.delete("ot_tasks");
  jar.delete("ot_work");
  redirect("/");
}

/** Saves the athlete's own hour estimates and done checkmarks from the work list. */
export async function saveWork(form: FormData) {
  const { work } = await readPrefs();
  const ids = form.getAll("id").map(String);
  const done = new Set(work.done.filter((d) => !ids.includes(d)));
  const est = { ...work.est };
  for (const id of ids) {
    const h = Number(form.get(`h:${id}`));
    if (Number.isFinite(h) && h >= 0 && h <= 100) est[id] = h;
    if (form.get(`d:${id}`) === "on") done.add(id);
  }
  await writeWork({ est, done: [...done] });
  revalidatePath("/week");
}
