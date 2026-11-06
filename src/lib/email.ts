// Drafts the "I'll be away for a game" email to a professor or TF. The athlete
// edits it before anything is sent; Overtime never sends mail on its own.

export type DraftInput = {
  course: string;
  place: string; // "Penn"
  away: boolean; // traveling, or a home game
  tripStart: Date;
  tripEnd: Date;
  missed: { title: string; start: Date }[];
  due: { title: string; due: Date }[];
  tz: string;
  athleteName?: string | null;
  sport?: string | null;
  toName?: string | null; // "Prof. Dana Whitfield"
};

const strip = (title: string, course: string) => {
  const t = title.replace(new RegExp(`^${course.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*`, "i"), "").trim();
  return t || title;
};

export function greeting(toName?: string | null): string {
  if (!toName) return "Hi Professor,";
  const clean = toName.replace(/,.*$/, "").trim();
  const titled = clean.match(/^(Prof\.?|Professor|Dr\.?)\s+(.+)$/i);
  if (titled) {
    const last = titled[2].split(/\s+/).pop();
    return `Hi ${/^dr/i.test(titled[1]) ? "Dr." : "Professor"} ${last},`;
  }
  return `Hi ${clean.split(/\s+/)[0]},`;
}

export function draftEmail(i: DraftInput): { subject: string; body: string } {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: i.tz, weekday: "long", month: "short", day: "numeric" });
  const dayShort = new Intl.DateTimeFormat("en-US", { timeZone: i.tz, weekday: "long" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: i.tz, hour: "numeric", minute: "2-digit" });
  const team = i.sport ? `the ${i.sport} team` : "a varsity team";
  const where = i.away ? `traveling for our game at ${i.place}` : `playing in our game against ${i.place}`;
  const when =
    day.format(i.tripStart) === day.format(i.tripEnd) ? `on ${day.format(i.tripStart)}` : `from ${day.format(i.tripStart)} to ${day.format(i.tripEnd)}`;

  const lines: string[] = [greeting(i.toName), ""];
  lines.push(`I'm on ${team} and I'll be ${where} ${when}.`);
  if (i.missed.length) {
    const what = i.missed.map((m) => `${strip(m.title, i.course).toLowerCase()} on ${day.format(m.start)} at ${time.format(m.start)}`);
    lines.push(`That means I'll miss ${list(what)}.`);
  }
  if (i.due.length) {
    const what = i.due.map((t) => `${strip(t.title, i.course)} (due ${dayShort.format(t.due)} at ${time.format(t.due)})`);
    lines.push(`${cap(list(what))} ${i.due.length === 1 ? "is" : "are"} due while I'm away or right after I get back.`);
  }
  lines.push("");
  const asks: string[] = [];
  if (i.due.length) asks.push(`could I turn in ${i.due.length === 1 ? "it" : "them"} early, or have a short extension`);
  if (i.missed.length) asks.push("is there anything I should do to catch up on what I miss");
  lines.push(asks.length ? `${cap(asks.join(", and "))}?` : "Please let me know if I need to do anything ahead of time.");
  lines.push("I can send a travel letter from the athletics office if you need one.");
  lines.push("", "Thank you,", i.athleteName || "[Your name]");

  const subject = `${i.course}: ${i.away ? `away for the ${i.place} game` : `game vs ${i.place}`} (${day.format(i.tripStart)})`;
  return { subject, body: lines.join("\n").trimEnd() };
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compose links: the email opens ready to send in the athlete's own mail. */
export function composeLinks(to: string, subject: string, body: string) {
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString().replace(/\+/g, "%20");
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&${q({ to, su: subject, body })}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?${q({ to, subject, body })}`,
    mail: `mailto:${encodeURIComponent(to)}?${q({ subject, body })}`,
  };
}
