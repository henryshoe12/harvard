import { connection } from "next/server";
import { ClassView } from "./ClassView";

export const metadata = { title: "Class · Overtime" };
export const instant = false;

export default async function ClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ demo?: string }> }) {
  await connection();
  const [{ id }, { demo }] = await Promise.all([params, searchParams]);
  return <ClassView id={id} demo={demo === "1"} />;
}
