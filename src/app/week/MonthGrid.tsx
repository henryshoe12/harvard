import Link from "next/link";
import type { FreeBlock } from "@/lib/freetime";
import { addDays, dayKey, localDay, type LocalDay } from "@/lib/time";
import type { CalEvent, Task } from "@/lib/types";
import styles from "./week.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The month at a glance: games, trips and deadlines on each day, everything else
 * as a count. Tap a day to open it.
 */
export function MonthGrid({
  start,
  weeks,
  month,
  tz,
  events,
  due,
  free,
  today,
  dayHref,
}: {
  start: LocalDay;
  weeks: number;
  month: number;
  tz: string;
  events: CalEvent[];
  due: Task[];
  free: FreeBlock[] | null;
  today: string;
  dayHref: (key: string) => string;
}) {
  const byDay = new Map<string, { big: CalEvent[]; other: number; due: Task[]; free: number }>();
  const slot = (k: string) => {
    if (!byDay.has(k)) byDay.set(k, { big: [], other: 0, due: [], free: 0 });
    return byDay.get(k)!;
  };
  for (const e of events) {
    const s = slot(dayKey(localDay(e.start, tz)));
    if (e.kind === "game" || e.kind === "travel") {
      // One chip per trip leg is enough: skip a second "Travel" the same day.
      if (!s.big.some((b) => b.kind === e.kind && e.kind === "travel")) s.big.push(e);
    } else s.other++;
  }
  for (const t of due) slot(dayKey(localDay(t.due, tz))).due.push(t);
  for (const f of free ?? []) slot(f.day).free += (f.end.getTime() - f.start.getTime()) / 3600000;

  return (
    <div className={styles.month}>
      {DOW.map((d) => (
        <div key={d} className={styles.monthDow}>
          {d}
        </div>
      ))}
      {Array.from({ length: weeks * 7 }, (_, i) => {
        const day = addDays(start, i);
        const k = dayKey(day);
        const s = byDay.get(k);
        const chips = [
          ...(s?.big ?? []).map((e) => ({ key: e.id, text: e.kind === "game" ? e.title : "Travel", cls: styles[`k_${e.kind}`] })),
          ...(s?.due ?? []).map((t) => ({ key: t.id, text: t.title, cls: styles.dueMark })),
        ];
        const shown = chips.slice(0, 3);
        const more = chips.length - shown.length;
        return (
          <Link
            key={k}
            href={dayHref(k)}
            className={`${styles.monthCell} ${day.m !== month ? styles.otherMonth : ""} ${k === today ? styles.monthToday : ""}`}
          >
            <span className={styles.monthNum}>{day.d}</span>
            {shown.map((c) => (
              <span key={c.key} className={`${styles.monthChip} ${c.cls}`}>
                {c.text}
              </span>
            ))}
            {more > 0 && <span className={styles.monthMore}>+{more} more</span>}
            {free && s && s.free >= 0.5 && <span className={styles.monthFree}>{Math.round(s.free * 2) / 2}h free</span>}
            {!free && s?.other ? (
              <span className={styles.monthMore}>
                {s.other} on schedule
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
