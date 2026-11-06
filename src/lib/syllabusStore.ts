"use client";

import { useSyncExternalStore } from "react";
import { demoGrades, demoSyllabi } from "./demoSyllabi";
import type { ClassGrades } from "./grades";
import type { Syllabus } from "./syllabus";

// Syllabi and grades live in this browser only (like the rest of v1's settings),
// until accounts and storage arrive with Supabase.

const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = () => l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** A JSON value in localStorage with a stable snapshot for React. */
function stored<T>(key: string, empty: T, clean: (raw: unknown) => T) {
  let cache: { raw: string | null; value: T } = { raw: null, value: empty };
  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}
    if (raw === cache.raw) return cache.value;
    let value = empty;
    try {
      value = clean(JSON.parse(raw ?? "null"));
    } catch {}
    cache = { raw, value };
    return value;
  };
  const write = (value: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
    listeners.forEach((l) => l());
  };
  return { read, write, empty };
}

const syllabi = stored<Syllabus[]>("ot_syllabi", [], (raw) =>
  Array.isArray(raw) ? raw.filter((s) => s && typeof s.id === "string" && typeof s.code === "string") : [],
);

const grades = stored<Record<string, ClassGrades>>("ot_grades", {}, (raw) => {
  const out: Record<string, ClassGrades> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, g] of Object.entries(raw as Record<string, Partial<ClassGrades>>)) {
    const scores: Record<string, number[]> = {};
    for (const [cat, xs] of Object.entries(g?.scores ?? {})) if (Array.isArray(xs)) scores[cat] = xs.filter((x) => typeof x === "number");
    out[id] = { scores, credits: typeof g?.credits === "number" ? g.credits : 4 };
  }
  return out;
});

const useReady = () => useSyncExternalStore(subscribe, () => true, () => false);

/** The athlete's classes. In the demo, sample syllabi instead. `ready` is false until the browser has loaded them. */
export function useSyllabi(demo = false): { list: Syllabus[]; ready: boolean } {
  const list = useSyncExternalStore(subscribe, demo ? demoSyllabi : syllabi.read, () => syllabi.empty);
  return { list, ready: useReady() };
}

export function saveSyllabus(s: Syllabus) {
  syllabi.write([...syllabi.read().filter((x) => x.id !== s.id), s].sort((a, b) => a.code.localeCompare(b.code)));
}

export function deleteSyllabus(id: string) {
  syllabi.write(syllabi.read().filter((x) => x.id !== id));
  const { [id]: _gone, ...rest } = grades.read();
  void _gone;
  grades.write(rest);
}

// The demo's grades are kept in memory so trying the calculator doesn't touch real data.
let demoState: Record<string, ClassGrades> | null = null;
const readDemoGrades = () => (demoState ??= demoGrades());

/** Scores entered for each class, by class id. */
export function useGrades(demo = false): Record<string, ClassGrades> {
  return useSyncExternalStore(subscribe, demo ? readDemoGrades : grades.read, () => grades.empty);
}

export function saveGrades(id: string, g: ClassGrades, demo = false) {
  if (demo) {
    demoState = { ...readDemoGrades(), [id]: g };
    listeners.forEach((l) => l());
  } else grades.write({ ...grades.read(), [id]: g });
}
