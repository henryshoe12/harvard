import { z } from "zod";

// What Overtime keeps from a syllabus: who teaches it, the rules, and every dated item.
export const SyllabusSchema = z.object({
  code: z.string().describe('Course code as students write it, e.g. "MATH 21A". Use the short title if there is no code.'),
  title: z.string().describe("Full course title"),
  term: z.string().nullable().describe('e.g. "Fall 2026"'),
  staff: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().describe('"Professor", "Preceptor", "TF", "CA", ...'),
        email: z.string().nullable(),
        officeHours: z.string().nullable(),
      }),
    )
    .describe("Instructors and teaching staff, the main instructor first"),
  meetings: z.array(z.string()).describe('When and where the class meets, e.g. "Mon/Wed/Fri 10:30–11:45, Science Center B"'),
  grading: z.array(z.object({ item: z.string(), weight: z.string() })).describe('Grade breakdown, e.g. {item: "Problem sets", weight: "30%"}'),
  rules: z
    .array(z.object({ topic: z.string(), text: z.string() }))
    .describe(
      'The course rules a student must follow, in plain words, one or two sentences each. Topics like "Attendance", "Late work", "Excused absences", "Extensions", "Exams", "Collaboration", "AI use", "Devices". Only rules the syllabus actually states.',
    ),
  athleteNotes: z
    .array(z.string())
    .describe(
      "What this syllabus means for a student athlete who travels for games: how to get an absence excused, how much notice is needed, whether late work or makeup exams are allowed, drop-lowest-score rules. Short, factual, quoting the syllabus's own rules. Empty if it says nothing relevant.",
    ),
  dates: z
    .array(
      z.object({
        title: z.string().describe('e.g. "Problem Set 8", "Midterm 2"'),
        date: z.string().describe("YYYY-MM-DD"),
        time: z.string().nullable().describe("HH:MM, 24-hour, if the syllabus gives one"),
        type: z.enum(["assignment", "exam", "quiz", "project", "reading", "other"]),
        hours: z.number().nullable().describe("A rough guess at hours of work for a typical student, or null for readings and events"),
      }),
    )
    .describe("Every dated deadline, exam and quiz in the syllabus, in date order"),
});

export type Syllabus = z.infer<typeof SyllabusSchema> & { id: string; addedAt: string };

export const SYLLABUS_PROMPT = (today: string) =>
  `This is a course syllabus uploaded by a college student athlete. Today is ${today}. Pull out the course details, rules and dated items exactly as the syllabus states them; don't invent anything that isn't there. When a date has no year, use the year that puts it in this academic term. Write rules and athlete notes in plain, short sentences a student would read on a phone.`;

/** URL-friendly id for a class page: "MATH 21A" → "math-21a". */
export function syllabusId(code: string): string {
  return (
    code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "class"
  );
}
