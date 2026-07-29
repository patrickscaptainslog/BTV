// Frontend helper for the backend classify route. The prototype's classify()
// can either call this, or keep its own fetch and just point it at
// "/api/classify" instead of "https://api.anthropic.com/v1/messages".
export async function classify({ messages, system, model, max_tokens }) {
  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, model, max_tokens }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `classify failed (${res.status})`);
  }
  const { text } = await res.json();
  return text;
}
