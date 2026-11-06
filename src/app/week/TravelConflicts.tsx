"use client";

import Link from "next/link";
import { useState } from "react";
import { courseKey } from "@/lib/conflicts";
import { composeLinks, draftEmail } from "@/lib/email";
import type { Syllabus } from "@/lib/syllabus";
import { useSyllabi } from "@/lib/syllabusStore";
import styles from "./week.module.css";

export type ConflictView = {
  id: string;
  place: string;
  away: boolean;
  start: string;
  end: string;
  courses: { course: string; missed: { title: string; start: string }[]; due: { title: string; due: string }[] }[];
};

type Props = { conflicts: ConflictView[]; tz: string; athleteName: string; sport: string; demo: boolean };

/** Classes and deadlines that land on a trip, with a ready-to-edit email for each course. */
export function TravelConflicts({ conflicts, tz, athleteName, sport, demo }: Props) {
  const { list: syllabi } = useSyllabi(demo);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" });
  const classesHref = demo ? "/classes?demo=1" : "/classes";

  return (
    <section className={styles.conflicts} aria-label="Travel conflicts">
      {conflicts.map((c) => (
        <div key={c.id} className={styles.conflictCard}>
          <div className={styles.conflictHead}>
            <h2>
              {c.away ? `${c.place} trip` : `Game vs ${c.place}`} runs into {c.courses.length} class{c.courses.length === 1 ? "" : "es"}
            </h2>
            <span>
              {fmt.format(new Date(c.start))} – {fmt.format(new Date(c.end))}
            </span>
          </div>
          <ul className={styles.conflictList}>
            {c.courses.map((k) => (
              <CourseRow
                key={k.course}
                trip={c}
                row={k}
                syllabus={syllabi.find((s) => courseKey(s.code) === courseKey(k.course))}
                tz={tz}
                fmt={fmt}
                athleteName={athleteName}
                sport={sport}
                classesHref={classesHref}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function CourseRow({
  trip,
  row,
  syllabus,
  tz,
  fmt,
  athleteName,
  sport,
  classesHref,
}: {
  trip: ConflictView;
  row: ConflictView["courses"][number];
  syllabus?: Syllabus;
  tz: string;
  fmt: Intl.DateTimeFormat;
  athleteName: string;
  sport: string;
  classesHref: string;
}) {
  const staff = (syllabus?.staff ?? []).filter((s) => s.email);
  // Syllabi often say who handles absences ("email your TF"); otherwise the main instructor.
  const tfFirst = syllabus?.athleteNotes.some((n) => /\bTF\b|teaching fellow/i.test(n));
  const defaultTo = (tfFirst ? staff.find((s) => /TF|teaching fellow/i.test(s.role)) : undefined) ?? staff[0];
  const [open, setOpen] = useState(false);
  const [toIdx, setToIdx] = useState(-1);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const links = composeLinks(to, subject, body);
  const notes = syllabus?.athleteNotes.slice(0, 2) ?? [];

  const draft = (toName: string | null) =>
    draftEmail({
      course: syllabus?.code ?? row.course,
      place: trip.place,
      away: trip.away,
      tripStart: new Date(trip.start),
      tripEnd: new Date(trip.end),
      missed: row.missed.map((m) => ({ title: m.title, start: new Date(m.start) })),
      due: row.due.map((d) => ({ title: d.title, due: new Date(d.due) })),
      tz,
      athleteName,
      sport,
      toName,
    });

  // The draft is written when the email opens, so it uses the syllabus once it has loaded.
  const toggle = () => {
    if (!open) {
      const i = defaultTo ? staff.indexOf(defaultTo) : -1;
      const d = draft(staff[i]?.name ?? null);
      setToIdx(i);
      setTo(staff[i]?.email ?? "");
      setSubject(d.subject);
      setBody(d.body);
      setCopied(false);
    }
    setOpen(!open);
  };

  // Switching who it's to changes the greeting and keeps the athlete's edits below it.
  const pickTo = (i: number) => {
    setToIdx(i);
    setTo(staff[i]?.email ?? "");
    const greet = draft(staff[i]?.name ?? null).body.split("\n")[0];
    setBody((b) => [greet, ...b.split("\n").slice(1)].join("\n"));
  };

  return (
    <li className={styles.conflictRow}>
      <div className={styles.conflictMain}>
        <div>
          <strong>{syllabus?.code ?? row.course}</strong>
          <ul className={styles.conflictItems}>
            {row.missed.map((m) => (
              <li key={m.title + m.start}>
                Misses {m.title.replace(new RegExp(`^${row.course}\\s*:?\\s*`, "i"), "")} · {fmt.format(new Date(m.start))}
              </li>
            ))}
            {row.due.map((d) => (
              <li key={d.title + d.due}>
                {capFirst(d.title.replace(new RegExp(`^${row.course}\\s*:?\\s*`, "i"), ""))} due {fmt.format(new Date(d.due))}
              </li>
            ))}
          </ul>
          {notes.length > 0 ? (
            <p className={styles.syllabusNote}>
              <span>Syllabus:</span> {notes.join(" ")}
            </p>
          ) : (
            row.course !== "Other" && (
              <p className={styles.hint}>
                <Link href={classesHref}>Add the {row.course} syllabus</Link> to see its absence rules and fill in the professor&apos;s email.
              </p>
            )
          )}
        </div>
        <button className={open ? styles.btn : styles.btnPrimary} onClick={toggle} aria-expanded={open}>
          {open ? "Close" : "Write email"}
        </button>
      </div>

      {open && (
        <div className={styles.emailBox}>
          {staff.length > 1 && (
            <div className={styles.chips}>
              {staff.map((s, i) => (
                <button key={s.email} type="button" className={i === toIdx ? styles.chipOn : styles.chip} onClick={() => pickTo(i)}>
                  {s.name} · {s.role}
                </button>
              ))}
            </div>
          )}
          <label>
            To
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="professor@college.harvard.edu" />
          </label>
          <label>
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            Message
            <textarea rows={11} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className={styles.sendRow}>
            <a className={styles.btnPrimary} href={links.gmail} target="_blank" rel="noreferrer">
              Open in Gmail
            </a>
            <a className={styles.btn} href={links.outlook} target="_blank" rel="noreferrer">
              Outlook
            </a>
            <a className={styles.btn} href={links.mail}>
              Mail app
            </a>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                navigator.clipboard?.writeText(`${subject}\n\n${body}`).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className={styles.hint}>Opens a draft in your own email so you can check it and press send.</p>
        </div>
      )}
    </li>
  );
}

function capFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
