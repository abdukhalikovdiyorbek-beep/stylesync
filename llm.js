// Serverless function (Vercel/Netlify Node runtime).
// Holds the Groq API key server-side and proxies chat completions.
// The browser calls POST /api/llm with { system, content }.
//   - content: a string  -> text request
//   - content: an array of blocks [{type:"text",text}, {type:"image",source:{media_type,data}}] -> vision request
//
// Models are env-overridable so you can swap them without touching code.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "GROQ_API_KEY is not set on the server." });
  }

  try {
    // Vercel auto-parses JSON bodies; fall back to manual parse just in case.
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { system, content } = payload;

    const hasImage = Array.isArray(content) && content.some((b) => b.type === "image");
    const model = hasImage ? VISION_MODEL : TEXT_MODEL;

    // Translate our block format -> OpenAI/Groq format.
    let userContent;
    if (typeof content === "string") {
      userContent = content;
    } else if (Array.isArray(content)) {
      userContent = content.map((b) => {
        if (b.type === "text") return { type: "text", text: b.text };
        if (b.type === "image") {
          return {
            type: "image_url",
            image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
          };
        }
        return b;
      });
    } else {
      return res.status(400).json({ error: "Invalid 'content' field." });
    }

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: userContent });

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
        // All our prompts request JSON; JSON mode makes parsing reliable.
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(groqRes.status).json({ error: errText });
    }

    const data = await groqRes.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
