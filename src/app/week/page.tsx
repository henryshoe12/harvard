import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { addTask, forgetMe, removeTask, saveSettings, signOutAction } from "@/app/actions";
import { canvasFeed, feedEvents } from "@/lib/canvas";
import { demoEvents, demoTasks } from "@/lib/demo";
import { listCalendar } from "@/lib/google";
import { planWeek } from "@/lib/planner";
import { readPrefs } from "@/lib/prefs";
import { addDays, atLocal, dayKey, localDay, parseDayKey, weekStart } from "@/lib/time";
import type { CalEvent, Task } from "@/lib/types";
import { WeekGrid } from "./WeekGrid";
import styles from "./week.module.css";

export const metadata = { title: "Your week · Overtime" };

// Every view reads the session and the athlete's own calendar, so render on request.
export const instant = false;

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ w?: string; demo?: string }> }) {
  await connection();
  const { w, demo: demoParam } = await searchParams;
  const demo = demoParam === "1";
  const session = demo ? null : await auth().catch(() => null);
  const { settings, canvasUrl, teamUrl, tasks: manualTasks } = await readPrefs();
  // Signed in with Google, or set up with calendar links only (schools that block Google apps).
  if (!demo && !session && !teamUrl && !canvasUrl) redirect("/");
  const tz = settings.tz;
  const monday = weekStart(w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? parseDayKey(w) : localDay(new Date(), tz));
  const from = atLocal(monday, 0, tz);
  const to = atLocal(addDays(monday, 7), 12 * 60, tz); // a little past Sunday so Monday's 6am event shapes Sunday night

  let events: CalEvent[] = [];
  let tasks: Task[] = [...manualTasks];
  const problems: string[] = [];

  if (demo) {
    events = demoEvents(monday, tz);
    tasks.push(...demoTasks(monday, tz));
  } else {
    if (session && (!session.accessToken || session.error)) {
      problems.push("Your Google sign-in expired. Sign out and back in.");
    } else if (session?.accessToken) {
      try {
        // Canvas deadlines are looked up three weeks ahead so a midterm next week shapes this week.
        const cal = await listCalendar(session.accessToken, from, atLocal(addDays(monday, 21), 0, tz), tz);
        events = cal.events.filter((e) => e.start < to);
        tasks.push(...cal.tasks);
      } catch (e) {
        problems.push(`Couldn't read Google Calendar (${(e as Error).message}).`);
      }
    }
    if (canvasUrl) {
      try {
        const canvas = await canvasFeed(canvasUrl, from, atLocal(addDays(monday, 21), 0, tz), tz);
        tasks.push(...canvas.tasks);
        events.push(...canvas.events.filter((e) => e.start < to));
      } catch (e) {
        problems.push(`Couldn't read your Canvas link: ${(e as Error).message}.`);
      }
    }
    if (teamUrl) {
      try {
        const seen = new Set(events.map((e) => `${e.title}|${e.start.getTime()}`));
        events.push(...(await feedEvents(teamUrl, from, to)).filter((e) => !seen.has(`${e.title}|${e.start.getTime()}`)));
      } catch (e) {
        problems.push(`Couldn't read your team schedule link: ${(e as Error).message}.`);
      }
    }
  }
  // Same deadline from Google Calendar and the Canvas link: keep one.
  // Past-due work drops off: it can't be planned anymore.
  const now = demo ? from : new Date();
  const cutoff = now > from ? now : from;
  const seenTasks = new Set<string>();
  tasks = tasks.filter((t) => {
    const k = `${t.title.toLowerCase()}|${t.due.getTime()}`;
    if (t.due <= cutoff || seenTasks.has(k)) return false;
    seenTasks.add(k);
    return true;
  });

  const plan = planWeek({ start: monday, events, tasks, settings, now });
  const hours = (kind: "study" | "sleep") =>
    plan.blocks.filter((b) => b.kind === kind).reduce((n, b) => n + (b.end.getTime() - b.start.getTime()) / 3600000, 0);
  const sleepNights = plan.blocks.filter((b) => b.kind === "sleep").length;
  const fmtDue = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  const q = (week: string) => `/week?w=${week}${demo ? "&demo=1" : ""}`;

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <h1>
          Week of {monday.m}/{monday.d}
        </h1>
        <nav className={styles.nav}>
          <Link className={styles.btn} href={q(dayKey(addDays(monday, -7)))}>
            ← Prev
          </Link>
          <Link className={styles.btn} href={demo ? "/week?demo=1" : "/week"}>
            This week
          </Link>
          <Link className={styles.btn} href={q(dayKey(addDays(monday, 7)))}>
            Next →
          </Link>
          {demo ? (
            <Link className={styles.btnPrimary} href="/">
              Use my calendar
            </Link>
          ) : (
            <form action={session ? signOutAction : forgetMe}>
              <button className={styles.btn}>{session ? "Sign out" : "Start over"}</button>
            </form>
          )}
        </nav>
      </header>

      {demo && <div className={styles.banner}>Demo week: a sample in-season football schedule. Sign in to plan your own.</div>}
      {problems.map((p) => (
        <div key={p} className={styles.warn}>
          {p}
        </div>
      ))}
      {(plan.sleepConflicts.length > 0 || plan.shortfalls.length > 0) && (
        <details className={styles.warn}>
          <summary>
            {[
              plan.shortfalls.length && `${plan.shortfalls.length} assignment${plan.shortfalls.length > 1 ? "s" : ""} won't fit before the deadline`,
              plan.sleepConflicts.length && `${plan.sleepConflicts.length} late night${plan.sleepConflicts.length > 1 ? "s" : ""} cut into sleep`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </summary>
          <ul className={styles.warnList}>
            {plan.shortfalls.map((s) => (
              <li key={s.taskId}>
                {s.title}: about {Math.ceil(s.missingMins / 30) / 2} more hours needed
              </li>
            ))}
            {plan.sleepConflicts.map((c, i) => (
              <li key={`s${i}`}>
                {c.event} runs into your sleep (night of {c.day})
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={styles.layout}>
        <section style={{ display: "grid", gap: 12 }}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <b>{(hours("sleep") / sleepNights).toFixed(1)}h</b>
              <span>sleep protected per night</span>
            </div>
            <div className={styles.stat}>
              <b>{hours("study").toFixed(1)}h</b>
              <span>study time planned</span>
            </div>
            <div className={styles.stat}>
              <b>{events.filter((e) => ["practice", "lift", "game", "film", "treatment", "travel"].includes(e.kind)).length}</b>
              <span>team events worked around</span>
            </div>
          </div>
          <div className={styles.gridWrap}>
            <WeekGrid monday={monday} tz={tz} events={events} blocks={plan.blocks} />
          </div>
        </section>

        <aside className={styles.side}>
          <div className={styles.card}>
            <h2>Coursework ({tasks.length})</h2>
            <ul className={styles.taskList}>
              {[...tasks]
                .sort((a, b) => a.due.getTime() - b.due.getTime())
                .map((t) => (
                  <li key={t.id}>
                    <div>
                      {t.title}
                      <small>
                        due {fmtDue.format(t.due)} · {t.hours}h{t.source === "canvas" ? " · Canvas" : ""}
                      </small>
                    </div>
                    {t.source === "manual" && (
                      <form action={removeTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className={styles.x} aria-label={`Remove ${t.title}`}>
                          ×
                        </button>
                      </form>
                    )}
                  </li>
                ))}
            </ul>
            <form action={addTask} style={{ display: "grid", gap: 8 }}>
              <label>
                Add something to study for
                <input name="title" placeholder="e.g. Math 21A midterm" required />
              </label>
              <div className={styles.row}>
                <label>
                  Due
                  <input name="dueDay" type="date" required defaultValue={dayKey(addDays(monday, 4))} />
                </label>
                <label>
                  Time
                  <input name="dueTime" type="time" defaultValue="23:59" />
                </label>
              </div>
              <label>
                Hours of work
                <input name="hours" type="number" min="0.5" max="40" step="0.5" defaultValue="2" required />
              </label>
              <button className={styles.btnPrimary}>Add and re-plan</button>
            </form>
          </div>

          <div className={styles.card}>
            <h2>Sleep and sources</h2>
            <form action={saveSettings} style={{ display: "grid", gap: 8 }}>
              <div className={styles.row}>
                <label>
                  Bedtime
                  <input name="bedtime" type="time" defaultValue={settings.bedtime} />
                </label>
                <label>
                  Wake up
                  <input name="wake" type="time" defaultValue={settings.wake} />
                </label>
              </div>
              <input type="hidden" name="tz" value={tz} />
              {!demo && (
                <label>
                  Team schedule link (Teamworks calendar sync)
                  <input name="teamUrl" type="url" placeholder="https://…" defaultValue={teamUrl} />
                </label>
              )}
              {!demo && (
                <label>
                  Canvas feed link (only if Canvas isn&apos;t already in your Google Calendar)
                  <input name="canvasUrl" type="url" placeholder="https://canvas.harvard.edu/feeds/calendars/…" defaultValue={canvasUrl} />
                </label>
              )}
              <button className={styles.btn}>Save and re-plan</button>
            </form>
            <p className={styles.hint}>
              Early morning on the calendar? The night before moves earlier so you keep the same hours of sleep. In Canvas, the feed link is under Calendar → Calendar Feed.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
