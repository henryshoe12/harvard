// Grade math for the GPA calculator. Each class's weights come from its syllabus;
// the athlete types in the scores they've gotten back.

/** Scores entered per grading category (percent, 0–100+), plus course credits. */
export type ClassGrades = { scores: Record<string, number[]>; credits: number };

/** Harvard's letter cutoffs and grade points. */
export const SCALE: { letter: string; min: number; points: number }[] = [
  { letter: "A", min: 93, points: 4.0 },
  { letter: "A-", min: 90, points: 3.67 },
  { letter: "B+", min: 87, points: 3.33 },
  { letter: "B", min: 83, points: 3.0 },
  { letter: "B-", min: 80, points: 2.67 },
  { letter: "C+", min: 77, points: 2.33 },
  { letter: "C", min: 73, points: 2.0 },
  { letter: "C-", min: 70, points: 1.67 },
  { letter: "D+", min: 67, points: 1.33 },
  { letter: "D", min: 63, points: 1.0 },
  { letter: "D-", min: 60, points: 0.67 },
  { letter: "E", min: 0, points: 0 },
];

export function letterFor(pct: number) {
  return SCALE.find((s) => pct >= s.min) ?? SCALE[SCALE.length - 1];
}

/** "30%" → 30, "25 percent" → 25, "1/3" → 33.3, anything else → 0. */
export function parseWeight(w: string): number {
  const frac = w.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac && Number(frac[2]) > 0 && !/%/.test(w)) return (Number(frac[1]) / Number(frac[2])) * 100;
  const n = parseFloat(w.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "92, 85/100, 18/20" → [92, 85, 90]. Fractions count as percent. */
export function parseScores(text: string): number[] {
  return text
    .split(/[,;\s]+/)
    .map((t) => {
      const f = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      if (f) return Number(f[2]) > 0 ? (Number(f[1]) / Number(f[2])) * 100 : NaN;
      return parseFloat(t.replace(/%$/, ""));
    })
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 150)
    .map((n) => Math.round(n * 10) / 10);
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export type ClassResult = {
  /** Grade so far, over only the categories with scores (null if none yet). */
  current: number | null;
  /** Share of the final grade that already has scores, 0–100. */
  graded: number;
  letter: string | null;
  points: number | null;
};

/** Current grade from the syllabus weights, counting only categories with scores. */
export function classGrade(grading: { item: string; weight: string }[], g: ClassGrades | undefined): ClassResult {
  const total = grading.reduce((n, c) => n + parseWeight(c.weight), 0) || 1;
  let earned = 0;
  let weightWithScores = 0;
  for (const c of grading) {
    const xs = g?.scores[c.item] ?? [];
    if (!xs.length) continue;
    const w = parseWeight(c.weight) / total;
    earned += w * avg(xs);
    weightWithScores += w;
  }
  if (!weightWithScores) return { current: null, graded: 0, letter: null, points: null };
  const current = earned / weightWithScores;
  const l = letterFor(current);
  return { current, graded: weightWithScores * 100, letter: l.letter, points: l.points };
}

/**
 * The average needed on everything not yet graded to finish at `target` percent.
 * Null when everything is graded; may be over 100 (out of reach) or under 0 (locked in).
 */
export function neededFor(target: number, grading: { item: string; weight: string }[], g: ClassGrades | undefined): number | null {
  const total = grading.reduce((n, c) => n + parseWeight(c.weight), 0) || 1;
  let earned = 0;
  let remaining = 0;
  for (const c of grading) {
    const w = parseWeight(c.weight) / total;
    const xs = g?.scores[c.item] ?? [];
    if (xs.length) earned += w * avg(xs);
    else remaining += w;
  }
  if (remaining <= 0.0001) return null;
  return (target - earned) / remaining;
}

/** Credit-weighted GPA across classes that have a letter so far. */
export function termGpa(classes: { points: number | null; credits: number }[]): number | null {
  const graded = classes.filter((c) => c.points !== null && c.credits > 0);
  const credits = graded.reduce((n, c) => n + c.credits, 0);
  if (!credits) return null;
  return graded.reduce((n, c) => n + c.points! * c.credits, 0) / credits;
}
