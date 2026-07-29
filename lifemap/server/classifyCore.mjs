import Anthropic from "@anthropic-ai/sdk";

// Shared classify handler used by both the local Express server and the
// Vercel serverless function. Key stays server-side in both environments.
const stripFences = (s) =>
  s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * @param {{messages?: any[], system?: string, model?: string, max_tokens?: number}} body
 * @returns {Promise<{status: number, json: object}>}
 */
export async function handleClassify(body) {
  const { messages, system, model, max_tokens } = body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, json: { error: "messages array is required" } };
  }
  try {
    const response = await getClient().messages.create({
      model: model ?? "claude-sonnet-4-6",
      max_tokens: max_tokens ?? 1000,
      ...(system ? { system } : {}),
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { status: 422, json: { error: "Request was declined by the model." } };
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return { status: 200, json: { text: stripFences(text) } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { status: 429, json: { error: "Rate limited, try again shortly." } };
    }
    if (err instanceof Anthropic.APIError) {
      return { status: err.status ?? 500, json: { error: err.message } };
    }
    console.error(err);
    return { status: 500, json: { error: "Internal error" } };
  }
}
