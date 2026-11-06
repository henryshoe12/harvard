import { addDays, atLocal, dayKey, type LocalDay } from "@/lib/time";
import type { CalEvent, PlanBlock } from "@/lib/types";
import styles from "./week.module.css";

const START_HOUR = 5;
const END_HOUR = 24;
const PX_PER_HOUR = 44;

type Item = { key: string; title: string; start: Date; end: Date; cls: string; sub?: string };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekGrid({ monday, tz, events, blocks }: { monday: LocalDay; tz: string; events: CalEvent[]; blocks: PlanBlock[] }) {
  const items: Item[] = [
    ...events.filter((e) => !e.allDay).map((e) => ({ key: `e-${e.id}`, title: e.title, start: e.start, end: e.end, cls: styles[`k_${e.kind}`] ?? styles.k_other })),
    ...blocks.map((b, i) => ({
      key: `p-${i}`,
      title: b.title,
      start: b.start,
      end: b.end,
      cls: b.kind === "sleep" ? styles.sleep : styles.study,
      sub: b.kind === "study" ? "Study" : undefined,
    })),
  ];
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const height = (END_HOUR - START_HOUR) * PX_PER_HOUR;

  return (
    <div className={styles.grid}>
      <div className={styles.hours} style={{ height }}>
        {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
          <div key={i} className={styles.hourLabel} style={{ top: i * PX_PER_HOUR }}>
            {((START_HOUR + i + 11) % 12) + 1}
            {START_HOUR + i < 12 ? "a" : "p"}
          </div>
        ))}
      </div>
      {DOW.map((name, i) => {
        const day = addDays(monday, i);
        const top = atLocal(day, START_HOUR * 60, tz).getTime();
        const bottom = atLocal(day, END_HOUR * 60, tz).getTime();
        return (
          <div key={dayKey(day)} className={styles.day}>
            <div className={styles.dayHead}>
              {name} <span>{day.m}/{day.d}</span>
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
                  const h = Math.max(((e - s) / 3600000) * PX_PER_HOUR, 14);
                  return (
                    <div key={it.key} className={`${styles.block} ${it.cls}`} style={{ top: y, height: h }} title={`${it.title} · ${fmt.format(it.start)}–${fmt.format(it.end)}`}>
                      <strong>{it.title}</strong>
                      {h > 30 && (
                        <small>
                          {fmt.format(it.start)}–{fmt.format(it.end)}
                        </small>
                      )}
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
