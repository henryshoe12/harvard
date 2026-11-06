import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signInWithGoogle, startWithLinks } from "./actions";
import styles from "./home.module.css";

// Every view reads the session and the athlete's own calendar, so render on request.
export const instant = false;

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const session = await auth().catch(() => null); // no auth config yet: still show the page and demo
  if (session) redirect("/week");
  const { error } = await searchParams;

  return (
    <main className={styles.main}>
      <p className={styles.kicker}>Overtime</p>
      <h1>Everything due. Every practice. Your free time.</h1>
      <p className={styles.lead}>
        Overtime puts your team schedule, your classes and every assignment due in one week view, with how long each piece of work should take
        and how much free time you actually have. You decide when to do it.
      </p>
      <div className={styles.ctas}>
        <form action={signInWithGoogle}>
          <button className={styles.primary}>Sign in with Google</button>
        </form>
        <Link className={styles.secondary} href="/week?demo=1">
          Try a demo week
        </Link>
      </div>
      <p className={styles.fine}>Overtime only reads your calendar. It never changes or shares it.</p>

      <form action={startWithLinks} className={styles.links}>
        <h2>School blocks Google sign-in? Use your calendar links instead.</h2>
        <label>
          Team schedule link
          <input name="teamUrl" type="url" placeholder="Teamworks → Profile → Calendar Sync" />
        </label>
        <label>
          Canvas calendar feed link
          <input name="canvasUrl" type="url" placeholder="Canvas → Calendar → Calendar Feed" />
        </label>
        {error === "links" && <p className={styles.error}>Paste at least one link.</p>}
        <button className={styles.secondary}>Plan my week</button>
        <p className={styles.fine}>Links are saved only in this browser.</p>
      </form>
    </main>
  );
}
