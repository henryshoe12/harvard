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
import { Alerts, type ConflictView, type Note } from "./Alerts";
import { MonthGrid } from "./MonthGrid";
import { WeekGrid, type PlannedBlock } from "./WeekGrid";
import styles from "./week.module.css";

export const metadata = { title: "Your week · Overtime" };

// Every view reads the session and the athlete's own calendar, so render on request.
export const instant = false;

type View = "day" | "week" | "month";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ w?: string; d?: string; view?: string; demo?: string; free?: string; plan?: string; len?: string }> }) {
  await connection();
  const { w, d: dParam, view: viewParam, demo: demoParam, free: freeParam, plan: planParam, len: lenParam } = await searchParams;
  // Planning a task happens on the day or week grid, with free time showing.
  const view: View = viewParam === "day" ? "day" : viewParam === "month" && !planParam ? "month" : "week";
  const showFree = freeParam === "1" || !!planParam;
  const demo = demoParam === "1";
  const session = demo ? null : await auth().catch(() => null);
  const { settings, canvasUrl, teamUrl, tasks: manualTasks, work, plan } = await readPrefs();
  // Signed in with Google, or set up with calendar links only (schools that block Google apps).
  if (!demo && !session && !teamUrl && !canvasUrl) redirect("/");
  const tz = settings.tz;
  const isKey = (k?: string) => !!k && /^\d{4}-\d{2}-\d{2}$/.test(k);
  // The day the athlete is looking at; day, week and month views are all built around it.
  const anchor = isKey(dParam) ? parseDayKey(dParam!) : isKey(w) ? parseDayKey(w!) : localDay(new Date(), tz);
  const monday = weekStart(anchor);
  const from = atLocal(monday, 0, tz);
  const to = atLocal(addDays(monday, 7), 0, tz);
  // What the calendar shows: one day, the week, or the whole month (as full weeks).
  const firstOfMonth = { y: anchor.y, m: anchor.m, d: 1 };
  const lastOfMonth = addDays({ y: anchor.m === 12 ? anchor.y + 1 : anchor.y, m: (anchor.m % 12) + 1, d: 1 }, -1);
  const viewStart = view === "day" ? anchor : view === "month" ? weekStart(firstOfMonth) : monday;
  const daysBetween = (a: typeof anchor, b: typeof anchor) => Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
  const viewDays = view === "day" ? 1 : view === "month" ? daysBetween(viewStart, weekStart(lastOfMonth)) + 7 : 7;
  const viewFrom = atLocal(viewStart, 0, tz);
  const viewTo = atLocal(addDays(viewStart, viewDays), 0, tz);
  // Load enough for both the view and this week's work list.
  const loadFrom = viewFrom < from ? viewFrom : from;
  const loadTo = viewTo > to ? viewTo : to;
  const loadDeadlinesTo = new Date(loadTo.getTime() + 21 * 86400000);

  let events: CalEvent[] = [];
  let tasks: Task[] = [...manualTasks];
  const problems: string[] = [];

  if (demo) {
    // The sample week's schedule, repeated for every week on screen; its homework once.
    for (let wk = weekStart(localDay(loadFrom, tz)); atLocal(wk, 0, tz) < loadTo; wk = addDays(wk, 7)) {
      const tag = dayKey(wk);
      events.push(...demoEvents(wk, tz).map((e) => ({ ...e, id: `${e.id}-${tag}` })));
    }
    tasks.push(...demoTasks(monday, tz));
  } else {
    if (session && (!session.accessToken || session.error)) {
      problems.push("Your Google sign-in expired. Sign out and back in.");
    } else if (session?.accessToken) {
      try {
        // Deadlines are looked up three weeks ahead so next week's midterm shows as coming up.
        const cal = await listCalendar(session.accessToken, loadFrom, loadDeadlinesTo, tz);
        events = cal.events.filter((e) => e.start < loadTo);
        tasks.push(...cal.tasks);
      } catch (e) {
        problems.push(`Couldn't read Google Calendar (${(e as Error).message}).`);
      }
    }
    if (canvasUrl) {
      try {
        const canvas = await canvasFeed(canvasUrl, loadFrom, loadDeadlinesTo, tz);
        tasks.push(...canvas.tasks);
        events.push(...canvas.events.filter((e) => e.start < loadTo));
      } catch (e) {
        problems.push(`Couldn't read your Canvas link: ${(e as Error).message}.`);
      }
    }
    if (teamUrl) {
      try {
        const seen = new Set(events.map((e) => `${e.title}|${e.start.getTime()}`));
        events.push(...(await feedEvents(teamUrl, loadFrom, loadTo)).filter((e) => !seen.has(`${e.title}|${e.start.getTime()}`)));
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

  // Work sessions the athlete placed in their free time.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const plannedMins = new Map<string, number>();
  for (const p of plan) plannedMins.set(p.taskId, (plannedMins.get(p.taskId) ?? 0) + p.mins);
  const planned: PlannedBlock[] = plan.map((p) => ({
    taskId: p.taskId,
    title: byId.get(p.taskId)?.title ?? "Planned work",
    start: p.start,
    end: new Date(p.start.getTime() + p.mins * 60000),
  }));
  const plannedHours = (t: Task) => (plannedMins.get(t.id) ?? 0) / 60;
  // Planned sessions take up time, so free time is what's left around them.
  const busy = (list: CalEvent[]) => [
    ...list,
    ...planned.map((p) => ({ id: `plan-${p.taskId}-${p.start.getTime()}`, title: p.title, start: p.start, end: p.end, kind: "other" as const })),
  ];

  // Free time between fixed commitments, inside the hours the athlete says their day runs.
  const weekEvents = events.filter((e) => e.end > from && e.start < to);
  const free = freeTime({ start: monday, events: busy(weekEvents), tz, dayStart: settings.wake, dayEnd: settings.bedtime });
  const freeLeft = hoursIn(free, now > from ? now : undefined);
  // Work still to find time for: what's due, minus what's already planned.
  const workHours = thisWeek.reduce((n, t) => n + Math.max(0, t.hours - plannedHours(t)), 0);
  const plannedThisWeek = thisWeek.reduce((n, t) => n + Math.min(t.hours, plannedHours(t)), 0);
  const fixedHours = hoursIn(weekEvents.filter((e) => !e.allDay));
  const viewEvents = events.filter((e) => e.end > viewFrom && e.start < viewTo);
  const viewPlanned = planned.filter((p) => p.end > viewFrom && p.start < viewTo);
  const viewFree = showFree
    ? freeTime({ start: viewStart, days: viewDays, events: busy(viewEvents), tz, dayStart: settings.wake, dayEnd: settings.bedtime }).filter(
        (f) => demo || f.end > now,
      )
    : [];

  // Planning mode: the task being placed and how long each session is.
  const planTask = planParam ? byId.get(planParam) : undefined;
  const planLeft = planTask ? Math.max(0, Math.round(planTask.hours * 60 - (plannedMins.get(planTask.id) ?? 0))) : 0;
  const lenOptions = [30, 60, 90, 120].filter((m) => m < planLeft);
  const planLen = planTask ? Math.min(planLeft, Number(lenParam) > 0 ? Number(lenParam) : planLeft <= 120 ? planLeft : 90) : 0;
  const viewDue = open.filter((t) => t.due >= viewFrom && t.due < viewTo);

  // Trips and games this week that land on class time or deadlines.
  const conflicts: ConflictView[] = findConflicts(weekEvents, open)
    .filter((c) => c.trip.end > now)
    .map((c) => ({
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
  const notes: Note[] = [
    ...(tight
      ? [
          {
            id: "tight",
            tone: "warn" as const,
            text: `${round(workHours)}h of work is due this week, and you have ${round(freeLeft)}h of free time left.`,
            detail: "Free time counts the open gaps of 30 minutes or more between when your day starts and ends (Settings). Turn on Show free time to see them.",
          },
        ]
      : []),
    ...problems.map((p, i) => ({ id: `p${i}`, tone: "warn" as const, text: p.split(/[(:]/)[0].trim().replace(/\.$/, "") + ".", detail: p })),
  ];

  const fmtDue = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" });
  const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const utc = (d: typeof monday) => new Date(Date.UTC(d.y, d.m - 1, d.d));
  const fmtRange = (d: typeof monday) => utc(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const sunday = addDays(monday, 6);
  const title =
    view === "day"
      ? utc(anchor).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
      : view === "month"
        ? utc(anchor).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
        : `${fmtRange(monday)} – ${sunday.m === monday.m ? sunday.d : fmtRange(sunday)}`;
  const today = dayKey(localDay(new Date(), tz));
  const link = (opts: { d?: string; view?: View; free?: boolean; plan?: string | null; len?: number }) => {
    const p = new URLSearchParams();
    const v = opts.view ?? view;
    if (v !== "week") p.set("view", v);
    if (opts.d) p.set("d", opts.d);
    if (demo) p.set("demo", "1");
    const planning = opts.plan === undefined ? planParam : opts.plan;
    if (planning) {
      p.set("plan", planning);
      const l = opts.len ?? (opts.plan === undefined ? Number(lenParam) || 0 : 0);
      if (l) p.set("len", String(l));
    } else if (opts.free ?? freeParam === "1") p.set("free", "1");
    const qs = p.toString();
    return `/week${qs ? `?${qs}` : ""}`;
  };
  const step = (n: number) =>
    dayKey(view === "day" ? addDays(anchor, n) : view === "week" ? addDays(monday, 7 * n) : { y: anchor.m + n > 12 ? anchor.y + 1 : anchor.m + n < 1 ? anchor.y - 1 : anchor.y, m: ((anchor.m + n + 11) % 12) + 1, d: 1 });
  const here = dayKey(anchor);
  const unit = view === "day" ? "day" : view === "week" ? "week" : "month";

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
        {!done.has(t.id) && (
          <Link className={`${styles.planBtn} ${planTask?.id === t.id ? styles.planBtnOn : ""}`} href={link({ plan: t.id, view: view === "day" ? "day" : "week", d: here })}>
            {plannedHours(t) >= t.hours && t.hours > 0 ? "✓ All planned" : plannedHours(t) > 0 ? `${round(plannedHours(t))} of ${round(t.hours)}h planned` : "Plan time"}
          </Link>
        )}
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
          <p className={styles.brand}>
            Overtime{demo && <span className={styles.demoTag}>Demo</span>}
          </p>
          <h1>{title}</h1>
          <p className={styles.summary}>
            <b>{round(workHours)}h</b> of work {plannedThisWeek > 0 ? `still to plan (${round(plannedThisWeek)}h planned)` : "due this week"} · <b className={tight ? styles.tightText : ""}>{round(freeLeft)}h</b> free
            {now > from && now < to ? " left" : ""} · <b>{round(fixedHours)}h</b> on your schedule
          </p>
        </div>
        <nav className={styles.nav}>
          <div className={styles.segment}>
            <Link className={styles.segBtn} href={link({ d: step(-1) })} aria-label={`Previous ${unit}`}>
              ‹
            </Link>
            <Link className={styles.segBtn} href={link({})}>
              Today
            </Link>
            <Link className={styles.segBtn} href={link({ d: step(1) })} aria-label={`Next ${unit}`}>
              ›
            </Link>
          </div>
          <div className={styles.segment} role="group" aria-label="View">
            {(["day", "week", "month"] as const).map((v) => (
              <Link key={v} className={`${styles.segBtn} ${v === view ? styles.segOn : ""}`} href={link({ view: v, d: here })} aria-current={v === view}>
                {v[0].toUpperCase() + v.slice(1)}
              </Link>
            ))}
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

      <Alerts conflicts={conflicts} notes={notes} tz={tz} athleteName={athleteName} sport={sport} demo={demo} />

      <div className={styles.layout}>
        <section className={styles.main}>
          {planTask && (
            <div className={styles.planBar}>
              <div>
                <b>Planning: {planTask.title}</b>
                <span>
                  {round(planTask.hours)}h total · {round(plannedHours(planTask))}h planned ·{" "}
                  {planLeft > 0 ? `${round(planLeft / 60)}h left. Tap any free time to put a session there.` : "all planned."}
                </span>
              </div>
              {planLeft > 0 && (
                <div className={styles.lenRow}>
                  <span>Session</span>
                  {[...lenOptions, planLeft].map((m) => (
                    <Link key={m} className={m === planLen ? styles.chipOn : styles.chip} href={link({ len: m, d: here })}>
                      {m === planLeft ? `All ${round(m / 60)}h` : `${round(m / 60)}h`}
                    </Link>
                  ))}
                  {planLen > 0 && planLen < planLeft && <span className={styles.lenNote}>= {Math.ceil(planLeft / planLen)} sessions</span>}
                </div>
              )}
              <Link className={styles.btnPrimary} href={link({ plan: null, d: here })}>
                Done
              </Link>
            </div>
          )}
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
              {planned.length > 0 && (
                <span>
                  <i className={styles.dotPlanned} />
                  Planned work
                </span>
              )}
            </div>
            <Link className={`${styles.toggle} ${showFree ? styles.toggleOn : ""}`} href={link({ d: here, free: !showFree, plan: null })} aria-pressed={showFree}>
              <span className={styles.knob} />
              Show free time
            </Link>
          </div>
          {view === "month" ? (
            <MonthGrid
              start={viewStart}
              weeks={viewDays / 7}
              month={anchor.m}
              tz={tz}
              events={viewEvents}
              due={viewDue}
              free={showFree ? viewFree : null}
              today={today}
              dayHref={(k) => link({ view: "day", d: k })}
            />
          ) : (
            <div className={styles.gridWrap}>
              <WeekGrid
                start={viewStart}
                days={viewDays}
                tz={tz}
                events={viewEvents}
                free={viewFree}
                due={viewDue}
                planned={viewPlanned}
                placing={planTask && planLeft > 0 ? { taskId: planTask.id, mins: planLen } : undefined}
                today={today}
              />
            </div>
          )}
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
