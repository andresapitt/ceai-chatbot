// ShineVR secure backend: Gemini chat proxy  (deploy marker: r1)
// ==========================================
// A stateless serverless function (Vercel / Node 18+). It holds the Gemini API
// key in an environment variable so the key is NEVER sent to the browser or
// committed to GitHub. The static frontend POSTs the conversation here; this
// function adds the key and the system prompt, calls Gemini, and returns only
// the reply text.
//
// Endpoint (on Vercel): POST /api/chat
// Request body:  { "contents": [ { "role": "user"|"model", "parts": [{ "text": "..." }] }, ... ] }
// Response body: { "reply": "..." }  or  { "error": "..." }

const MODEL = "gemini-2.5-flash";

// Only this origin may call the function from a browser. Set ALLOWED_ORIGIN in
// the Vercel dashboard to your GitHub Pages URL. Defaults to the project's.
const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "https://andresapitt.github.io";

// The system prompt lives server-side so users cannot change or bypass it.
// Keep this in sync with knowledge.md at the repo root.
const SYSTEM_PROMPT = `
You are the ShineVR Technical Support Assistant for Shine-VR (www.shine-vr.com),
a healthcare company providing VR therapy software for chronic pain distraction
and stress reduction. Your users are clinicians, hospital staff, and patients
who are rarely technical and are often busy or anxious.

Identity and tone: helpful, clear, and reassuring. Speak in the first person
("I can help you with that"). Do not apologize, do not hedge, and do not mention
your own limitations.

Logic:
1. Identify the device first: Meta Quest, Pico Neo, or the mobile smartphone app.
2. Give the matching troubleshooting steps for that device.
3. Deliver guidance one clear step at a time. Do not dump a wall of steps. Wait
   for the user to confirm a step worked before giving the next one.
4. Escalation: if the problem persists after the steps, or the user needs
   enterprise/clinician unlock codes, tell them to email support@shine-vr.com.

You cover: connecting to hospital or clinic Wi-Fi, pairing and navigating
controllers, fixing fuzzy or blurry screens, recentering or resetting the view,
logging in, and entering platform Unlock Codes. Never invent unlock codes,
passwords, or Wi-Fi credentials; tell the user to get those from their ShineVR
administrator.

Medical boundary: if a user asks for medical advice, state that Shine-VR is a
wellness platform for distraction and stress reduction, and they must consult a
licensed medical professional for clinical diagnosis or treatment.

Style: keep sentences short (10 to 20 words), one action per sentence, active
voice, everyday vocabulary, no jargon. Never use em dashes or semicolons. Use
periods, commas, or bullet points.
`.trim();

function setCors(res, origin) {
  // Reflect the origin only if it is the allowed one. Browsers enforce this.
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCors(res, origin);

  // Preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }
  // Block browser callers from other origins.
  if (origin && origin !== ALLOWED_ORIGIN) {
    res.status(403).json({ error: "Origin not allowed." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
    return;
  }

  // Vercel parses JSON bodies automatically; guard anyway.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const contents = body && body.contents;
  if (!Array.isArray(contents) || contents.length === 0) {
    res.status(400).json({ error: "No conversation provided." });
    return;
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
        }),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || "Upstream error.";
      res.status(502).json({ error: msg });
      return;
    }
    const parts =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts) || [];
    const reply = parts.map((p) => p.text || "").join("");
    res.status(200).json({ reply });
  } catch (err) {
    res.status(502).json({ error: "Could not reach the model: " + String(err) });
  }
}
