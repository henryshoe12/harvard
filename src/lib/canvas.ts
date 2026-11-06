import ical from "node-ical";
import type { Task } from "./types";

/** Rough hours to plan for a Canvas item, from its title. Editable later. */
export function estimateHours(title: string): number {
  if (/\b(final|midterm|exam|test)\b/i.test(title)) return 6;
  if (/\b(paper|essay|project|draft)\b/i.test(title)) return 4;
  if (/\b(problem set|pset|homework|hw|assignment|lab)\b/i.test(title)) return 3;
  if (/\b(quiz|reading|response|discussion|post)\b/i.test(title)) return 1;
  return 2;
}

/**
 * Upcoming assignments from a Canvas calendar feed (Canvas > Calendar >
 * Calendar Feed). Only https URLs on instructure.com or a .edu domain are
 * accepted so the server can't be pointed at arbitrary hosts.
 */
export async function canvasTasks(feedUrl: string, from: Date, to: Date): Promise<Task[]> {
  const url = new URL(feedUrl.replace(/^webcal:/, "https:"));
  if (url.protocol !== "https:" || !/(\.instructure\.com|\.edu)$/i.test(url.hostname)) {
    throw new Error("That doesn't look like a Canvas calendar feed link.");
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Canvas feed error ${res.status}`);
  const data = ical.sync.parseICS(await res.text());

  const tasks: Task[] = [];
  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const due = item.end ?? item.start;
    if (!due || due < from || due > to) continue;
    const title = String(typeof item.summary === "string" ? item.summary : (item.summary as { val?: string })?.val ?? "Assignment");
    tasks.push({ id: `canvas-${item.uid}`, title, due: new Date(due), hours: estimateHours(title), source: "canvas" });
  }
  return tasks;
}
