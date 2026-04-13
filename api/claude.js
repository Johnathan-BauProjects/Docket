export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  const { prompt, max_tokens = 1200 } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt" });

  const key = process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY;
  if (!key) return res.status(500).json({ error: "No API key configured" });

  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens,
          messages: [{ role: "user", content: prompt }]
        }),
      });

      const data = await response.json();

      if (response.status === 529 || response.status === 503 || response.status === 500) {
        if (i < 2) { await new Promise(r => setTimeout(r, (i + 1) * 3000)); continue; }
        return res.status(529).json({ error: "Anthropic overloaded", detail: data });
      }

      if (!response.ok) return res.status(response.status).json({ error: "Anthropic error", detail: data });

      const text = data.content?.map(b => b.text || "").join("") || "";
      return res.status(200).json({ text });

    } catch (err) {
      if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 3000));
      else return res.status(500).json({ error: err.message });
    }
  }
}
