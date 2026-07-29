import "dotenv/config";
import express from "express";
import { handleClassify } from "./classifyCore.mjs";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.",
  );
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "10mb" })); // room for base64 photos later

app.post("/api/classify", async (req, res) => {
  const { status, json } = await handleClassify(req.body);
  res.status(status).json(json);
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Lifemap API listening on http://localhost:${port}`);
});
