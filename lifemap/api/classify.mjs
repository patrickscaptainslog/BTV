// Vercel serverless function — same handler the local Express server uses.
// Set ANTHROPIC_API_KEY in the Vercel project's environment variables.
import { handleClassify } from "../server/classifyCore.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const { status, json } = await handleClassify(req.body);
  res.status(status).json(json);
}
