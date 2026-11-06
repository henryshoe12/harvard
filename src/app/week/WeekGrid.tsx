import type { FreeBlock } from "@/lib/freetime";
import { addDays, atLocal, dayKey, type LocalDay } from "@/lib/time";
import type { CalEvent, Task } from "@/lib/types";
import styles from "./week.module.css";

const START_HOUR = 6;
const END_HOUR = 24;
const PX_PER_HOUR = 46;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Item = { key: string; title: string; start: Date; end: Date; cls: string; label?: string; minH?: number };

/** A day or a week: fixed schedule, deadlines as small markers, and (optionally) free time. */
export function WeekGrid({
  start,
  days = 7,
  tz,
  events,
  free,
  due,
  today,
}: {
  start: LocalDay;
  days?: number;
  tz: string;
  events: CalEvent[];
  free: FreeBlock[];
  due: Task[];
  today?: string;
}) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  // "7–8:15am", "11:30am–1pm": short enough to fit a narrow block.
  const parts = (d: Date) => {
    const [, h, m, ap] = fmt.format(d).match(/(\d+):(\d+)\s*([AP]M)/) ?? [];
    return { t: m === "00" ? h : `${h}:${m}`, ap: (ap ?? "").toLowerCase() };
  };
  const range = (a: Date, b: Date) => {
    const x = parts(a),
      y = parts(b);
    return x.ap === y.ap ? `${x.t}–${y.t}${y.ap}` : `${x.t}${x.ap}–${y.t}${y.ap}`;
  };
  const freeLabel = (a: Date, b: Date) => `${Math.round(((b.getTime() - a.getTime()) / 3600000) * 2) / 2}h free`;

  const items: Item[] = [
    ...free.map((f, i) => ({ key: `f-${i}`, title: freeLabel(f.start, f.end), start: f.start, end: f.end, cls: styles.free, label: range(f.start, f.end) })),
    ...events
      .filter((e) => !e.allDay)
      .map((e) => ({ key: `e-${e.id}`, title: e.title, start: e.start, end: e.end, cls: styles[`k_${e.kind}`] ?? styles.k_other, label: range(e.start, e.end) })),
    ...due.map((t) => ({
      key: `d-${t.id}`,
      title: `Due: ${t.title}`,
      start: new Date(t.due.getTime() - 20 * 60000),
      end: t.due,
      cls: styles.dueMark,
      minH: 20,
    })),
  ];
  const height = (END_HOUR - START_HOUR) * PX_PER_HOUR;

  return (
    <div
      className={styles.grid}
      style={days === 1 ? { gridTemplateColumns: "52px 1fr", minWidth: 0 } : undefined}
    >
      <div className={styles.hours} style={{ height }}>
        {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
          <div key={i} className={styles.hourLabel} style={{ top: i * PX_PER_HOUR }}>
            {i % 2 === 1 ? "" : `${((START_HOUR + i + 11) % 12) + 1}${START_HOUR + i < 12 ? "am" : "pm"}`}
          </div>
        ))}
      </div>
      {Array.from({ length: days }, (_, i) => {
        const day = addDays(start, i);
        const name = DOW[new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay()];
        const top = atLocal(day, START_HOUR * 60, tz).getTime();
        const bottom = atLocal(day, END_HOUR * 60, tz).getTime();
        return (
          <div key={dayKey(day)} className={`${styles.day} ${dayKey(day) === today ? styles.today : ""}`}>
            <div className={styles.dayHead}>
              <span className={styles.dow}>{name}</span>
              <span className={styles.dnum}>{day.d}</span>
            </div>
            <div className={styles.dayBody} style={{ height }}>
              {Array.from({ length: END_HOUR - START_HOUR }, (_, h) => (
                <div key={h} className={styles.line} style={{ top: h * PX_PER_HOUR }} />
              ))}
              {items
                .filter((it) => it.start.getTime() < bottom && it.end.getTime() > top)
                .map((it) => {
                  const s = Math.max(it.start.getTime(), top);
                  const e = Math.min(it.end.getTime(), bottom);
                  const y = ((s - top) / 3600000) * PX_PER_HOUR;
                  const h = Math.max(((e - s) / 3600000) * PX_PER_HOUR, it.minH ?? 14);
                  return (
                    <div key={it.key} className={`${styles.block} ${it.cls}`} style={{ top: y, height: h }} title={it.label ? `${it.title} · ${it.label}` : it.title}>
                      <strong>{it.title}</strong>
                      {it.label && h > 30 && <small>{it.label}</small>}
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
