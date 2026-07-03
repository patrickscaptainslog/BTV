import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getItem } from "@/lib/bank";
import { CR_RUBRIC } from "@/content/rubric";

export const maxDuration = 60;

const MAX_RESPONSE_CHARS = 20000;

export async function POST(req: Request) {
  if (!isAuthorized()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const body = (await req.json()) as { itemId?: string; response?: string };
  const item = body.itemId ? getItem(body.itemId) : undefined;
  if (!item || item.type !== "cr" || !body.response?.trim()) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const studentResponse = body.response.slice(0, MAX_RESPONSE_CHARS);

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    system:
      "You are an experienced CSET Mathematics constructed-response scorer. You apply the CTC's focused holistic scoring scale strictly and consistently, the way an unforgiving but fair human scorer would. You never inflate scores: a response with a significant mathematical error cannot score above 2; a response that is correct but thin on justification is a 3. You respond ONLY with valid JSON.",
    messages: [
      {
        role: "user",
        content: `Score this constructed response for a CSET Mathematics practice exam.

SCORING SCALE:
${CR_RUBRIC}

ASSIGNMENT:
${item.stem}

A MODEL 4-SCORE RESPONSE (for reference):
${item.modelAnswer}

CANDIDATE'S RESPONSE:
${studentResponse}

Return ONLY a JSON object with exactly these fields:
{"score": <1|2|3|4>, "justification": "<2-3 sentences citing the rubric language and the specific strengths/deficiencies>", "feedback": "<2-4 sentences of concrete advice: what to add or fix to reach a 4>"}

Use $...$ LaTeX for any math in the justification and feedback.`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      score: number;
      justification: string;
      feedback: string;
    };
    const score = Math.min(4, Math.max(1, Math.round(parsed.score)));
    return NextResponse.json({ score, justification: parsed.justification, feedback: parsed.feedback });
  } catch {
    return NextResponse.json({ error: "Grader returned malformed output" }, { status: 502 });
  }
}
