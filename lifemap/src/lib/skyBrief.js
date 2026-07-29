import { classify } from "./classify.js";

// The galaxy shows; Claude reads it aloud. Builds a compact digest of the
// recent sky and asks for a three-sentence narration.
export async function fetchSkyBrief(entries, pulses) {
  const now = Date.now();
  const cutoff = now - 16 * 864e5;

  const recent = entries
    .filter((e) => new Date(e.createdAt).getTime() > cutoff)
    .map((e) => ({
      title: e.title,
      category: e.category,
      status: e.status,
      magnitude: Math.min(10, (e.importance ?? 5) + (e.boost ?? 0)),
      day: e.createdAt.slice(5, 10),
      resolved_something: Boolean(e.resolvesId),
    }));

  const openLoops = entries
    .filter((e) => e.status === "open" && (e.importance ?? 0) + (e.boost ?? 0) >= 5)
    .map((e) => e.title);

  const moodByDay = {};
  for (const p of pulses ?? []) {
    const d = p.t.slice(5, 10);
    (moodByDay[d] ??= []).push(p.mood);
  }
  const weather = Object.fromEntries(
    Object.entries(moodByDay).map(([d, ms]) => [
      d,
      Math.round((ms.reduce((a, b) => a + b, 0) / ms.length) * 10) / 10,
    ]),
  );

  const system = `You are the narrator of Lifemap, a journal rendered as a galaxy. Given a digest of the user's recent sky — journal stars, open loops, and daily mood weather (1-10) — write a "sky brief": 2 to 3 sentences, second person, warm but unsentimental, concrete. Name at most two specific entries by title. Mention what grew, what closed, and the emotional weather if it had shape. No markdown, no preamble, no sign-off — just the sentences.`;

  return classify({
    system,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ stars: recent, open_loops: openLoops, mood_weather: weather }),
      },
    ],
  });
}
