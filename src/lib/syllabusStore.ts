"use client";

import { useSyncExternalStore } from "react";
import { demoSyllabi } from "./demoSyllabi";
import type { Syllabus } from "./syllabus";

// Uploaded syllabi live in this browser only (like the rest of v1's settings),
// until accounts and storage arrive with Supabase.
const KEY = "ot_syllabi";
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: Syllabus[] } = { raw: null, list: [] };
const EMPTY: Syllabus[] = [];

function read(): Syllabus[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw === cache.raw) return cache.list;
  let list: Syllabus[] = [];
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) list = parsed.filter((s) => s && typeof s.id === "string" && typeof s.code === "string");
  } catch {}
  cache = { raw, list };
  return list;
}

function write(list: Syllabus[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** The athlete's classes. In the demo, sample syllabi instead. `ready` is false until the browser has loaded them. */
export function useSyllabi(demo = false): { list: Syllabus[]; ready: boolean } {
  const list = useSyncExternalStore(subscribe, demo ? demoSyllabi : read, () => EMPTY);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return { list, ready };
}

export function saveSyllabus(s: Syllabus) {
  write([...read().filter((x) => x.id !== s.id), s].sort((a, b) => a.code.localeCompare(b.code)));
}

export function deleteSyllabus(id: string) {
  write(read().filter((x) => x.id !== id));
}
