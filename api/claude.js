export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, max_tokens = 1200 } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt" });

  const key = process.env.OPENAI_KEY;
  if (!key) return res.status(500).json({ error: "No API key configured" });

  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens,
          messages: [{ role: "user", content: prompt }]
        }),
      });

      if (response.status === 429 || response.status === 503) {
        if (i < 2) { await new Promise(r => setTimeout(r, (i + 1) * 3000)); continue; }
      }

      const data = await response.json();

      if (!response.ok) return res.status(response.status).json({ error: "OpenAI error", detail: data });

      const text = data.choices?.[0]?.message?.content || "";
      return res.status(200).json({ text });

    } catch (err) {
      if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 3000));
      else return res.status(500).json({ error: err.message });
    }
  }
}
