"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addTask } from "@/app/actions";
import type { Syllabus } from "@/lib/syllabus";
import { deleteSyllabus, useSyllabi } from "@/lib/syllabusStore";
import { fmtDay } from "../ClassesView";
import styles from "../classes.module.css";

type Dated = Syllabus["dates"][number];

const TYPE_LABEL: Record<Dated["type"], string> = {
  assignment: "Assignment",
  exam: "Exam",
  quiz: "Quiz",
  project: "Project",
  reading: "Reading",
  other: "Other",
};

/** One class: what an athlete needs to know, the rules, and every due date. */
export function ClassView({ id, demo }: { id: string; demo: boolean }) {
  const router = useRouter();
  const { list, ready } = useSyllabi(demo);
  const s = list.find((x) => x.id === id);
  const q = demo ? "?demo=1" : "";
  const [added, setAdded] = useState<Set<string>>(new Set());

  if (!ready) return <main className={styles.page} />;
  if (!s) {
    return (
      <main className={styles.page}>
        <p className={styles.empty}>
          That class isn&apos;t in this browser. <Link href={`/classes${q}`}>See your classes</Link>
        </p>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const dates = [...s.dates].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const upcoming = dates.filter((d) => d.date >= today);
  const past = dates.filter((d) => d.date < today);
  const key = (d: Dated) => `${d.title}|${d.date}`;
  const soon = upcoming.filter((d) => d.type !== "reading" && daysFrom(today, d.date) <= 21 && !added.has(key(d)));

  async function add(d: Dated) {
    const f = new FormData();
    f.set("title", `${s!.code}: ${d.title}`);
    f.set("dueDay", d.date);
    f.set("dueTime", d.time ?? "23:59");
    f.set("hours", String(Math.min(40, Math.max(0.5, d.hours ?? (d.type === "exam" ? 6 : 2)))));
    await addTask(f);
    setAdded((a) => new Set(a).add(key(d)));
  }

  const row = (d: Dated, isPast: boolean) => (
    <li key={key(d)} className={isPast ? styles.past : ""}>
      <span className={styles.when}>
        {fmtDay(d.date)}
        {d.time && <small>{fmtTime(d.time)}</small>}
      </span>
      <span className={styles.what}>
        {d.title}
        <small>
          <i className={styles[`t_${d.type}`]}>{TYPE_LABEL[d.type]}</i>
          {d.hours ? ` · about ${d.hours}h` : ""}
        </small>
      </span>
      {!isPast && d.type !== "reading" && (
        <button className={styles.addBtn} onClick={() => add(d)} disabled={added.has(key(d))}>
          {added.has(key(d)) ? "Added" : "Add to week"}
        </button>
      )}
    </li>
  );

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className={styles.brand}>
            <Link href={`/classes${q}`}>Classes</Link> · {s.term ?? "This term"}
          </p>
          <h1>
            {s.code} <span className={styles.subtitle}>{s.title}</span>
          </h1>
        </div>
        <Link className={styles.btn} href={`/week${q}`}>
          My week
        </Link>
      </header>

      {s.athleteNotes.length > 0 && (
        <section className={styles.athlete}>
          <h2>If you travel for a game</h2>
          <ul>
            {s.athleteNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Assignments and exams</h2>
            {soon.length > 1 && (
              <button
                className={styles.btn}
                onClick={async () => {
                  for (const d of soon) await add(d);
                }}
              >
                Add the next 3 weeks to my week
              </button>
            )}
          </div>
          {upcoming.length ? <ul className={styles.dates}>{upcoming.map((d) => row(d, false))}</ul> : <p className={styles.hint}>Nothing else is due this term.</p>}
          {past.length > 0 && (
            <details>
              <summary className={styles.subhead}>Earlier ({past.length})</summary>
              <ul className={styles.dates}>{past.map((d) => row(d, true))}</ul>
            </details>
          )}
        </section>

        <aside className={styles.side}>
          {s.rules.length > 0 && (
            <section className={styles.card}>
              <h2>Rules</h2>
              <dl className={styles.rules}>
                {s.rules.map((r) => (
                  <div key={r.topic + r.text}>
                    <dt>{r.topic}</dt>
                    <dd>{r.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {s.grading.length > 0 && (
            <section className={styles.card}>
              <h2>Grading</h2>
              <ul className={styles.grading}>
                {s.grading.map((g) => (
                  <li key={g.item}>
                    <span>{g.item}</span>
                    <b>{g.weight}</b>
                    <i style={{ width: `${Math.min(100, parseFloat(g.weight) || 0)}%` }} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(s.staff.length > 0 || s.meetings.length > 0) && (
            <section className={styles.card}>
              <h2>People and times</h2>
              <ul className={styles.staff}>
                {s.staff.map((p) => (
                  <li key={p.name}>
                    <b>{p.name}</b> <span>{p.role}</span>
                    {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
                    {p.officeHours && <small>Office hours: {p.officeHours}</small>}
                  </li>
                ))}
                {s.meetings.map((m) => (
                  <li key={m}>
                    <small>{m}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!demo && (
            <button
              className={styles.btnGhost}
              onClick={() => {
                deleteSyllabus(s.id);
                router.push("/classes");
              }}
            >
              Remove this class
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}

function daysFrom(a: string, b: string) {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
