export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { prompt, max_tokens = 1200 } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt" });
  let lastError = null;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens, messages: [{ role: "user", content: prompt }] }),
      });
      if (response.status === 529 || response.status === 503) { await new Promise(r => setTimeout(r, (i+1)*3000)); continue; }
      const data = await response.json();
      return res.status(200).json({ text: data.content?.map(b => b.text||"").join("") || "" });
    } catch(err) { lastError = err; await new Promise(r => setTimeout(r, (i+1)*3000)); }
  }
  return res.status(500).json({ error: "Failed", detail: lastError?.message });
}
