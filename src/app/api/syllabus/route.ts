import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { SYLLABUS_PROMPT, SyllabusSchema, syllabusId } from "@/lib/syllabus";

// Reading a long syllabus can take a while.
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB

/** Turns an uploaded syllabus (PDF, or pasted text) into a class page's data. */
export async function POST(req: Request) {
  // Only this app's own pages may spend API credit on parsing.
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Syllabus reading isn't switched on yet: the app needs an ANTHROPIC_API_KEY." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const text = String(form?.get("text") ?? "").trim();
  let doc: Anthropic.Beta.BetaContentBlockParam;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB. Try a smaller PDF, or paste the text." }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (file.type === "application/pdf" || bytes.subarray(0, 4).toString() === "%PDF") {
      doc = { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } };
    } else if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      doc = { type: "document", source: { type: "text", media_type: "text/plain", data: bytes.toString("utf8") } };
    } else {
      return NextResponse.json({ error: "Upload a PDF, or paste the syllabus text. (For a Word file, save it as PDF first.)" }, { status: 415 });
    }
  } else if (text.length > 80) {
    doc = { type: "document", source: { type: "text", media_type: "text/plain", data: text.slice(0, 200_000) } };
  } else {
    return NextResponse.json({ error: "Choose a syllabus PDF or paste its text." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const client = new Anthropic();
  try {
    const res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(SyllabusSchema) },
      messages: [{ role: "user", content: [doc, { type: "text", text: SYLLABUS_PROMPT(today) }] }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json({ error: "Couldn't read that syllabus. Try pasting the text instead." }, { status: 422 });
    }
    const s = res.parsed_output;
    return NextResponse.json({ syllabus: { ...s, id: syllabusId(s.code), addedAt: new Date().toISOString() } });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Too many uploads right now. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      console.error("syllabus parse failed", e.status, e.message);
      return NextResponse.json({ error: "Couldn't read that syllabus right now. Try again." }, { status: 502 });
    }
    throw e;
  }
}
