"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { readPrefs, writeSettings, writeTasks } from "@/lib/prefs";
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
    canvasUrl: String(form.get("canvasUrl") ?? "").trim(),
  });
  revalidatePath("/week");
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
