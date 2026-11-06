import type { Syllabus } from "./syllabus";

// Sample syllabi for the demo, dated around the current week so they line up with
// the demo calendar. Names and emails are made up.
let memo: { key: string; list: Syllabus[] } | null = null;

export function demoSyllabi(): Syllabus[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const key = monday.toDateString();
  if (memo?.key === key) return memo.list;
  const d = (offset: number) => {
    const x = new Date(monday);
    x.setDate(x.getDate() + offset);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const addedAt = monday.toISOString();
  const list: Syllabus[] = [
    {
      id: "ec-10",
      code: "EC 10",
      title: "Principles of Economics",
      term: "Fall 2026",
      addedAt,
      staff: [
        { name: "Prof. Dana Whitfield", role: "Professor", email: "dwhitfield@example.edu", officeHours: "Wed 2–3pm, Littauer 210" },
        { name: "Sam Ortiz", role: "TF", email: "sortiz@example.edu", officeHours: "Thu 4–5pm, Lamont café" },
      ],
      meetings: ["Lecture Mon/Wed 1:30–2:45, Sanders Theatre", "Section Tue/Thu 9:00–10:15"],
      grading: [
        { item: "Problem sets", weight: "20%" },
        { item: "Section participation", weight: "10%" },
        { item: "Midterm", weight: "30%" },
        { item: "Final exam", weight: "40%" },
      ],
      rules: [
        { topic: "Late work", text: "Problem sets lose 10% per day late. Your lowest problem set score is dropped." },
        { topic: "Excused absences", text: "Varsity travel is excused if you email your TF at least one week before the trip." },
        { topic: "Exams", text: "Makeup exams only with a dean's excuse or a documented varsity conflict, arranged two weeks ahead." },
        { topic: "Collaboration", text: "You may work on problem sets together, but write up your own answers and list who you worked with." },
        { topic: "AI use", text: "AI tools are allowed for studying, not for writing problem set answers." },
      ],
      athleteNotes: [
        "Email your TF a week before any away game to have section excused.",
        "Your lowest problem set is dropped, so one missed set won't hurt.",
        "A midterm on a game day can be moved, but only if you ask two weeks ahead.",
      ],
      dates: [
        { title: "Problem Set 5", date: d(4), time: "17:00", type: "assignment", hours: 3 },
        { title: "Problem Set 6", date: d(11), time: "17:00", type: "assignment", hours: 3 },
        { title: "Midterm", date: d(15), time: "13:30", type: "exam", hours: 6 },
        { title: "Problem Set 7", date: d(25), time: "17:00", type: "assignment", hours: 3 },
        { title: "Final exam", date: d(45), time: "09:00", type: "exam", hours: 10 },
      ],
    },
    {
      id: "math-21a",
      code: "MATH 21A",
      title: "Multivariable Calculus",
      term: "Fall 2026",
      addedAt,
      staff: [{ name: "Dr. Priya Raman", role: "Preceptor", email: "praman@example.edu", officeHours: "Mon 3–4pm, Science Center 411" }],
      meetings: ["Mon/Wed/Fri 10:30–11:45, Science Center 309"],
      grading: [
        { item: "Problem sets", weight: "25%" },
        { item: "Midterms (2)", weight: "40%" },
        { item: "Final exam", weight: "35%" },
      ],
      rules: [
        { topic: "Attendance", text: "Attendance is expected. More than three unexcused absences can lower your grade." },
        { topic: "Late work", text: "Problem sets are due Wednesdays at 11:59pm. Two 48-hour extensions per term, no questions asked." },
        { topic: "Excused absences", text: "Athletic travel is excused with a note from your coach or the athletics office." },
        { topic: "Exams", text: "No makeup midterms. If you miss one with an excuse, the final counts for more." },
      ],
      athleteNotes: [
        "Get a travel note from the athletics office to have class excused.",
        "You have two free 48-hour extensions on problem sets. Save them for away weeks.",
        "Midterms can't be made up. Check midterm dates against away games now.",
      ],
      dates: [
        { title: "Problem Set 8", date: d(2), time: "23:59", type: "assignment", hours: 4 },
        { title: "Midterm 2", date: d(10), time: "19:00", type: "exam", hours: 8 },
        { title: "Problem Set 9", date: d(16), time: "23:59", type: "assignment", hours: 4 },
        { title: "Final exam", date: d(44), time: "14:00", type: "exam", hours: 10 },
      ],
    },
  ];
  memo = { key, list };
  return list;
}
