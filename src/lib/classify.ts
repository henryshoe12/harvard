import type { EventKind } from "./types";

// Ordered: the first matching rule wins, so "travel to Penn game" is travel.
const RULES: [EventKind, RegExp][] = [
  ["travel", /\b(travel|bus|flight|depart|departure|hotel|trip)\b/i],
  ["game", /(\bgame\b|\bvs\.?\s|\s@\s|\bmatch\b|\bkickoff\b)/i],
  ["lift", /\b(lift|lifting|weights?|strength|conditioning|s&c)\b/i],
  ["film", /\b(film|video|tape)\b/i],
  ["treatment", /\b(treatment|training room|rehab|physio|ice|recovery)\b/i],
  ["practice", /\b(practice|walk-?through|scrimmage|position meeting)\b/i],
  ["class", /\b(class|lecture|section|lab|seminar|office hours|midterm|exam|final)\b|\b[A-Z]{2,6}\s?\d{1,3}[A-Z]?\b/],
  ["meeting", /\b(meeting|team meeting|call)\b/i],
];

export function classify(title: string): EventKind {
  for (const [kind, re] of RULES) if (re.test(title)) return kind;
  return "other";
}

/** Kinds after which the body needs recovery time before focused study (a long bus ride counts). */
export const NEEDS_RECOVERY: EventKind[] = ["lift", "practice", "game", "travel"];
