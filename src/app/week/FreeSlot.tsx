"use client";

import { useState, useTransition } from "react";
import { planSession } from "@/app/actions";
import styles from "./week.module.css";

const SNAP = 15; // minutes

/**
 * A free gap the athlete can click to drop a work session into while planning.
 * The session starts where they click (snapped to 15 minutes) and stays inside the gap.
 */
export function FreeSlot({
  start,
  end,
  top,
  height,
  pxPerHour,
  title,
  label,
  taskId,
  mins,
}: {
  start: string;
  end: string;
  top: number;
  height: number;
  pxPerHour: number;
  title: string;
  label: string;
  taskId: string;
  mins: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const slotMins = (e - s) / 60000;
  const len = Math.min(mins, slotMins);

  // Minutes after the gap's start for a click at `y` pixels, kept inside the gap.
  const at = (y: number) => {
    const raw = Math.floor(((y / pxPerHour) * 60) / SNAP) * SNAP;
    return Math.max(0, Math.min(raw, slotMins - len));
  };

  return (
    <button
      type="button"
      className={`${styles.block} ${styles.free} ${styles.freePick}`}
      style={{ top, height }}
      title={`Put ${Math.round((len / 60) * 4) / 4}h here`}
      disabled={pending}
      onMouseMove={(ev) => setHover(at(ev.clientY - ev.currentTarget.getBoundingClientRect().top))}
      onMouseLeave={() => setHover(null)}
      onClick={(ev) => {
        const off = at(ev.clientY - ev.currentTarget.getBoundingClientRect().top);
        startTransition(() => planSession(taskId, new Date(s + off * 60000).toISOString(), len));
      }}
    >
      <strong>{pending ? "Adding…" : title}</strong>
      {height > 30 && <small>{label}</small>}
      {hover !== null && !pending && <span className={styles.ghost} style={{ top: (hover / 60) * pxPerHour, height: (len / 60) * pxPerHour }} />}
    </button>
  );
}
