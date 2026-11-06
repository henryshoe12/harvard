"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Syllabus } from "@/lib/syllabus";
import { saveSyllabus, useSyllabi } from "@/lib/syllabusStore";
import styles from "./classes.module.css";

export function nextDate(s: Syllabus) {
  const today = new Date().toISOString().slice(0, 10);
  return s.dates.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function fmtDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** All of the athlete's classes, and the place to add one from its syllabus. */
export function ClassesView({ demo }: { demo: boolean }) {
  const { list, ready } = useSyllabi(demo);
  const q = demo ? "?demo=1" : "";

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className={styles.brand}>Overtime</p>
          <h1>Your classes</h1>
        </div>
        <Link className={styles.btn} href={`/week${q}`}>
          ← Back to my week
        </Link>
      </header>
      {demo && <div className={styles.banner}>Demo: two sample syllabi. Upload one of yours below to try it for real.</div>}

      <div className={styles.cards}>
        {list.map((s) => {
          const next = nextDate(s);
          return (
            <Link key={s.id} href={`/classes/${s.id}${q}`} className={styles.classCard}>
              <span className={styles.code}>{s.code}</span>
              <span className={styles.title}>{s.title}</span>
              <span className={styles.meta}>{next ? `Next: ${next.title}, ${fmtDay(next.date)}` : "Nothing else dated this term"}</span>
              <span className={styles.meta}>
                {s.rules.length} rule{s.rules.length === 1 ? "" : "s"} · {s.dates.length} dates
              </span>
            </Link>
          );
        })}
        {ready && list.length === 0 && <p className={styles.empty}>No classes yet. Add a syllabus and Overtime builds a page for that class.</p>}
      </div>

      <Upload />
    </main>
  );
}

function Upload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/syllabus", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.syllabus) throw new Error(data.error || "Something went wrong. Try again.");
      saveSyllabus(data.syllabus as Syllabus);
      router.push(`/classes/${data.syllabus.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form action={submit} className={styles.upload}>
      <h2>Add a class from its syllabus</h2>
      <p className={styles.hint}>
        Overtime reads the syllabus and makes a page with the rules, grading, staff emails and every due date. It also uses the absence rules when it drafts
        travel emails.
      </p>
      {paste ? (
        <textarea name="text" rows={8} placeholder="Paste the whole syllabus here" required />
      ) : (
        <input name="file" type="file" accept="application/pdf,.pdf,.txt,text/plain" required />
      )}
      <div className={styles.uploadRow}>
        <button className={styles.btnPrimary} disabled={busy}>
          {busy ? "Reading the syllabus… (about 30 seconds)" : "Make the class page"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setPaste(!paste)} disabled={busy}>
          {paste ? "Upload a PDF instead" : "Paste text instead"}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <p className={styles.fine}>Saved only in this browser for now.</p>
    </form>
  );
}
