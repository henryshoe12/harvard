import { connection } from "next/server";
import { ClassesView } from "./ClassesView";

export const metadata = { title: "Your classes · Overtime" };
export const instant = false;

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  await connection();
  const { demo } = await searchParams;
  return <ClassesView demo={demo === "1"} />;
}
