import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getItem } from "@/lib/bank";

export const maxDuration = 30;

const MAX_TURNS = 16;
const MAX_TURN_CHARS = 4000;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Conversational tutor scoped to one question. The client sends the whole
 * visible thread each call; the question context and answer-hiding rules
 * live in the system prompt, so the student can ask anything about the
 * item without the tutor spoiling it pre-answer.
 */
export async function POST(req: Request) {
  if (!isAuthorized()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const body = (await req.json()) as {
    itemId?: string;
    answered?: boolean;
    userAnswer?: number;
    messages?: ChatTurn[];
  };
  const item = body.itemId ? getItem(body.itemId) : undefined;
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const valid =
    item &&
    item.type === "mc" &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user" &&
    messages.every(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= MAX_TURN_CHARS
    );
  if (!valid) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const answered = body.answered === true;
  const choicesText = item.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join("\n");
  const chose =
    typeof body.userAnswer === "number" && body.userAnswer >= 0 && body.userAnswer < 4
      ? String.fromCharCode(65 + body.userAnswer)
      : null;

  const system = `You are a patient, precise math tutor helping a candidate prepare for the CSET Mathematics exam. You are rigorous about correctness and never invent facts. Keep replies under 150 words, conversational, and focused on THIS question. Use $...$ LaTeX for all math. Formatting: plain sentences and short paragraphs only — the renderer supports **bold** and LaTeX but NOT markdown lists, headers, or *italics*, so never use those.

THE QUESTION THE STUDENT IS WORKING ON:
${item.stem}

CHOICES:
${choicesText}

CORRECT ANSWER: ${String.fromCharCode(65 + item.key)}

WORKED SOLUTION (for your reference):
${item.workedSolution}

${
  answered
    ? `The student has already answered${chose ? ` (they chose ${chose})` : ""} and has seen the worked solution. You may discuss the answer and solution freely, diagnose their specific error if they chose wrong, generalize the concept, or connect it to related exam topics.`
    : `The student has NOT yet answered. HARD RULE: do not reveal which choice is correct, do not state the final answer or its value, and do not eliminate choices down to one. Guide with questions, definitions, strategy, and partial steps — Socratic style. If they ask you directly for the answer, decline warmly and offer a stronger hint instead. If they propose an approach or partial work, tell them honestly whether they're on a productive track without completing the computation for them.`
}`;

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 900,
    system,
    messages,
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return NextResponse.json({ text });
}
