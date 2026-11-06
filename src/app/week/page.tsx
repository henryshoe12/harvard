import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { addTask, forgetMe, removeTask, saveSettings, saveWork, signOutAction } from "@/app/actions";
import { canvasFeed, feedEvents } from "@/lib/canvas";
import { findConflicts, tripName } from "@/lib/conflicts";
import { demoEvents, demoTasks } from "@/lib/demo";
import { listCalendar } from "@/lib/google";
import { freeTime, hoursIn } from "@/lib/freetime";
import { readPrefs } from "@/lib/prefs";
import { addDays, atLocal, dayKey, localDay, parseDayKey, weekStart } from "@/lib/time";
import type { CalEvent, Task } from "@/lib/types";
import { TravelConflicts, type ConflictView } from "./TravelConflicts";
import { WeekGrid } from "./WeekGrid";
import styles from "./week.module.css";

export const metadata = { title: "Your week · Overtime" };

// Every view reads the session and the athlete's own calendar, so render on request.
export const instant = false;

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ w?: string; demo?: string; free?: string }> }) {
  await connection();
  const { w, demo: demoParam, free: freeParam } = await searchParams;
  const showFree = freeParam === "1";
  const demo = demoParam === "1";
  const session = demo ? null : await auth().catch(() => null);
  const { settings, canvasUrl, teamUrl, tasks: manualTasks, work } = await readPrefs();
  // Signed in with Google, or set up with calendar links only (schools that block Google apps).
  if (!demo && !session && !teamUrl && !canvasUrl) redirect("/");
  const tz = settings.tz;
  const monday = weekStart(w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? parseDayKey(w) : localDay(new Date(), tz));
  const from = atLocal(monday, 0, tz);
  const to = atLocal(addDays(monday, 7), 0, tz);

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
        // Deadlines are looked up three weeks ahead so next week's midterm shows as coming up.
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
  // Same deadline from Google Calendar and the Canvas link: keep one. Past-due work drops off.
  const now = demo ? from : new Date();
  const cutoff = now > from ? now : from;
  const seenTasks = new Set<string>();
  tasks = tasks
    .filter((t) => {
      const k = `${t.title.toLowerCase()}|${t.due.getTime()}`;
      if (t.due <= cutoff || seenTasks.has(k)) return false;
      seenTasks.add(k);
      return true;
    })
    .map((t) => ({ ...t, hours: work.est[t.id] ?? t.hours }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const done = new Set(work.done);
  const open = tasks.filter((t) => !done.has(t.id));
  const thisWeek = open.filter((t) => t.due < to);
  const later = open.filter((t) => t.due >= to);
  const finished = tasks.filter((t) => done.has(t.id));

  // Free time between fixed commitments, inside the hours the athlete says their day runs.
  const free = freeTime({ start: monday, events, tz, dayStart: settings.wake, dayEnd: settings.bedtime });
  const freeLeft = hoursIn(free, now > from ? now : undefined);
  const workHours = thisWeek.reduce((n, t) => n + t.hours, 0);
  const fixedHours = hoursIn(events.filter((e) => !e.allDay && e.end > from && e.start < to));
  // Trips and games that land on class time or deadlines.
  const conflicts: ConflictView[] = findConflicts(events, open).map((c) => ({
    id: c.trip.id,
    place: tripName(c.trip),
    away: c.trip.away,
    start: c.trip.start.toISOString(),
    end: c.trip.end.toISOString(),
    courses: c.courses.map((k) => ({
      course: k.course,
      missed: k.missed.map((m) => ({ title: m.title, start: m.start.toISOString() })),
      due: k.due.map((t) => ({ title: t.title, due: t.due.toISOString() })),
    })),
  }));
  const athleteName = settings.name || (demo ? "" : (session?.user?.name ?? ""));
  const sport = settings.sport || (demo ? "football" : "");
  const round = (h: number) => (Math.round(h * 2) / 2).toString();
  const tight = workHours > freeLeft;

  const fmtDue = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" });
  const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const fmtRange = (d: typeof monday) => new Date(Date.UTC(d.y, d.m - 1, d.d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const sunday = addDays(monday, 6);
  const rangeLabel = `${fmtRange(monday)} – ${sunday.m === monday.m ? sunday.d : fmtRange(sunday)}`;
  const today = dayKey(localDay(new Date(), tz));
  const link = (opts: { week?: string; free?: boolean }) => {
    const p = new URLSearchParams();
    if (opts.week) p.set("w", opts.week);
    if (demo) p.set("demo", "1");
    if (opts.free ?? showFree) p.set("free", "1");
    const qs = p.toString();
    return `/week${qs ? `?${qs}` : ""}`;
  };

  const workRow = (t: Task, showDate: boolean) => (
    <li key={t.id} className={done.has(t.id) ? styles.isDone : ""}>
      <input type="hidden" name="id" value={t.id} />
      <label className={styles.check}>
        <input type="checkbox" name={`d:${t.id}`} defaultChecked={done.has(t.id)} aria-label={`Done: ${t.title}`} />
      </label>
      <div className={styles.workText}>
        {t.title}
        <small>
          Due {showDate ? fmtDate.format(t.due) : fmtDue.format(t.due)}
          {t.source === "canvas" ? " · Canvas" : ""}
        </small>
      </div>
      <label className={styles.hoursIn}>
        <input type="number" name={`h:${t.id}`} min="0" max="100" step="0.5" defaultValue={t.hours} aria-label={`Hours for ${t.title}`} />
        <span>h</span>
      </label>
    </li>
  );

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className={styles.brand}>Overtime</p>
          <h1>{rangeLabel}</h1>
        </div>
        <nav className={styles.nav}>
          <div className={styles.segment}>
            <Link className={styles.segBtn} href={link({ week: dayKey(addDays(monday, -7)) })} aria-label="Previous week">
              ‹
            </Link>
            <Link className={styles.segBtn} href={link({})}>
              Today
            </Link>
            <Link className={styles.segBtn} href={link({ week: dayKey(addDays(monday, 7)) })} aria-label="Next week">
              ›
            </Link>
          </div>
          <Link className={styles.btn} href={demo ? "/classes?demo=1" : "/classes"}>
            Classes
          </Link>
          {demo ? (
            <Link className={styles.btnPrimary} href="/">
              Use my calendar
            </Link>
          ) : (
            <form action={session ? signOutAction : forgetMe}>
              <button className={styles.btnGhost}>{session ? "Sign out" : "Start over"}</button>
            </form>
          )}
        </nav>
      </header>

      {demo && <div className={styles.banner}>Demo week: a sample in-season football schedule.</div>}
      {problems.map((p) => (
        <div key={p} className={styles.warn}>
          {p}
        </div>
      ))}

      {conflicts.length > 0 && <TravelConflicts conflicts={conflicts} tz={tz} athleteName={athleteName} sport={sport} demo={demo} />}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <b>{round(workHours)}h</b>
          <span>
            of work due this week · {thisWeek.length} item{thisWeek.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className={`${styles.stat} ${tight ? styles.statTight : ""}`}>
          <b>{round(freeLeft)}h</b>
          <span>{now > from && now < to ? "of free time left this week" : "of free time this week"}</span>
        </div>
        <div className={styles.stat}>
          <b>{round(fixedHours)}h</b>
          <span>on your fixed schedule</span>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.main}>
          <div className={styles.gridBar}>
            <div className={styles.legend}>
              <span>
                <i className={styles.dotTeam} />
                Team
              </span>
              <span>
                <i className={styles.dotClass} />
                Class
              </span>
              <span>
                <i className={styles.dotTravel} />
                Travel
              </span>
              <span>
                <i className={styles.dotDue} />
                Due
              </span>
              {showFree && (
                <span>
                  <i className={styles.dotFree} />
                  Free
                </span>
              )}
            </div>
            <Link className={`${styles.toggle} ${showFree ? styles.toggleOn : ""}`} href={link({ week: dayKey(monday), free: !showFree })} aria-pressed={showFree}>
              <span className={styles.knob} />
              Show free time
            </Link>
          </div>
          <div className={styles.gridWrap}>
            <WeekGrid monday={monday} tz={tz} events={events} free={showFree ? free : []} due={thisWeek} today={today} />
          </div>
        </section>

        <aside className={styles.side}>
          <form action={saveWork} className={styles.card}>
            <h2>
              Due this week <span className={styles.count}>{thisWeek.length}</span>
            </h2>
            {thisWeek.length === 0 ? <p className={styles.hint}>Nothing due for the rest of this week.</p> : <ul className={styles.workList}>{thisWeek.map((t) => workRow(t, false))}</ul>}
            {later.length > 0 && (
              <>
                <h3 className={styles.subhead}>Coming up</h3>
                <ul className={styles.workList}>{later.slice(0, 8).map((t) => workRow(t, true))}</ul>
              </>
            )}
            {finished.length > 0 && (
              <details>
                <summary className={styles.subhead}>Done ({finished.length})</summary>
                <ul className={styles.workList}>{finished.map((t) => workRow(t, true))}</ul>
              </details>
            )}
            <button className={styles.btn}>Save hours and checkmarks</button>
            <p className={styles.hint}>Hours are your own guess at how long each takes. Canvas items start with a rough estimate.</p>
          </form>

          <div className={styles.card}>
            <h2>Add work</h2>
            <form action={addTask} className={styles.stack}>
              <label>
                What is it?
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
                Hours it&apos;ll take
                <input name="hours" type="number" min="0.5" max="40" step="0.5" defaultValue="2" required />
              </label>
              <button className={styles.btnPrimary}>Add</button>
            </form>
            {manualTasks.length > 0 && (
              <ul className={styles.taskList}>
                {manualTasks.map((t) => (
                  <li key={t.id}>
                    <span>{t.title}</span>
                    <form action={removeTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className={styles.x} aria-label={`Remove ${t.title}`}>
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details className={styles.card}>
            <summary className={styles.cardSummary}>Settings</summary>
            <form action={saveSettings} className={styles.stack}>
              <div className={styles.row}>
                <label>
                  My day starts
                  <input name="wake" type="time" defaultValue={settings.wake} />
                </label>
                <label>
                  My day ends
                  <input name="bedtime" type="time" defaultValue={settings.bedtime} />
                </label>
              </div>
              <div className={styles.row}>
                <label>
                  Your name (for emails)
                  <input name="name" defaultValue={settings.name} placeholder={session?.user?.name ?? "First Last"} />
                </label>
                <label>
                  Your sport
                  <input name="sport" defaultValue={settings.sport} placeholder="football" />
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
                  Canvas feed link
                  <input name="canvasUrl" type="url" placeholder="https://canvas.harvard.edu/feeds/calendars/…" defaultValue={canvasUrl} />
                </label>
              )}
              <button className={styles.btn}>Save</button>
            </form>
            <p className={styles.hint}>Free time only counts between when your day starts and ends.</p>
          </details>
        </aside>
      </div>
    </main>
  );
}
