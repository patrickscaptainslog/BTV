import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.",
  );
  process.exit(1);
}

const client = new Anthropic();
const app = express();
app.use(express.json({ limit: "1mb" }));

// The prototype's classify() called api.anthropic.com directly, which only
// works inside Claude.ai artifacts. This route replaces that call: the
// frontend POSTs here, and the key stays server-side.
//
// Contract is deliberately close to the artifact fetch shape so the
// prototype's classify() only needs its URL swapped to /api/classify:
//   body: { messages, system?, model?, max_tokens? }
//   response: { text } — the first text block of the reply.
app.post("/api/classify", async (req, res) => {
  const { messages, system, model, max_tokens } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  try {
    const response = await client.messages.create({
      model: model ?? "claude-opus-5",
      max_tokens: max_tokens ?? 1024,
      ...(system ? { system } : {}),
      messages,
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "Request was declined by the model." });
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    res.json({ text });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Rate limited, try again shortly." });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(err.status ?? 500).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Lifemap API listening on http://localhost:${port}`);
});
