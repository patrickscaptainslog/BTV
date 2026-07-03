import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getItem } from "@/lib/bank";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isAuthorized()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const body = (await req.json()) as { itemId?: string; mode?: "hint" | "explain"; userAnswer?: number };
  const item = body.itemId ? getItem(body.itemId) : undefined;
  if (!item || item.type !== "mc" || (body.mode !== "hint" && body.mode !== "explain")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const choicesText = item.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join("\n");
  const prompt =
    body.mode === "hint"
      ? `A CSET Math candidate is working on this practice question and asked for a hint.

QUESTION:
${item.stem}

CHOICES:
${choicesText}

(The correct answer is ${String.fromCharCode(65 + item.key)}, and the worked solution is: ${item.workedSolution})

Give ONE short hint (2-3 sentences max) that points them toward the right approach or the key concept WITHOUT revealing the answer or doing the computation for them. Use $...$ LaTeX for math.`
      : `A CSET Math candidate answered this practice question${
          typeof body.userAnswer === "number" ? ` and chose ${String.fromCharCode(65 + body.userAnswer)}` : ""
        }. They have already seen the worked solution but want it explained differently.

QUESTION:
${item.stem}

CHOICES:
${choicesText}

CORRECT ANSWER: ${String.fromCharCode(65 + item.key)}

EXISTING WORKED SOLUTION:
${item.workedSolution}

Explain the solution a DIFFERENT way — different method if one exists, or more intuition, or a diagram-in-words. If they chose a wrong answer, briefly name the specific misconception that answer represents. Keep it under 150 words. Use $...$ LaTeX for math.`;

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 700,
    system:
      "You are a patient, precise math tutor preparing a candidate for the CSET Mathematics exam. You are rigorous about correctness and never invent facts.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return NextResponse.json({ text });
}
