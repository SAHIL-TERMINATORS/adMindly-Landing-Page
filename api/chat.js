/* Admindly — Gemini proxy (Vercel serverless function)
 * ----------------------------------------------------------------------------
 * The browser never sees the API key. The frontend POSTs a conversation here;
 * this function adds the system prompt + key and calls the Gemini REST API.
 *
 * Deploy: Vercel picks this up automatically as  POST /api/chat
 * Env vars (Project → Settings → Environment Variables):
 *   GEMINI_API_KEY   (required)  – from https://aistudio.google.com/apikey
 *   GEMINI_MODEL     (optional)  – default "gemini-2.5-flash"; set to a current
 *                                 id if that one 404s (the response says so)
 *   ALLOWED_ORIGINS  (optional)  – comma-separated allowlist; default "*"
 * ----------------------------------------------------------------------------
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const KEY = process.env.GEMINI_API_KEY;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());

const SYSTEM = {
  copilot:
`You are Admindly's Creative Copilot — a blunt, specific creative director for
short-form social video (Reels / TikTok) and static ads. The user brings a
creative and asks for feedback or floats a change.

You cannot see the footage. Reason only from what the user tells you; never
invent shots, timestamps or metrics you weren't given.

Return ONLY minified JSON, no prose around it, matching:
{"reply": string, "suggestions": [{"kind": string, "title": string, "detail": string}]}
- "reply": 2-4 conversational sentences. No preamble, no "Sure!".
- "suggestions": 0 to 3 items. "kind" is one of reorder | caption | hook | headline | pacing | other.
  "title" is a short imperative (max ~8 words). "detail" is 1-2 sentences the user could act on.
- If the user is just chatting, return a reply and an empty suggestions array.`,
  insight:
`You are Admindly's analytics explainer. Given a snapshot of a brand's social
metrics, explain the single most likely driver of the change, in plain language
a marketer will trust. No hedging list, no "it could be many things".

Return ONLY minified JSON matching: {"reply": string}
- "reply": 2-3 sentences, specific, names the probable cause and one thing to try.`
};

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  applyCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (ALLOWED[0] !== '*' && origin && !ALLOWED.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const task = body.task === 'insight' ? 'insight' : 'copilot';
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const context = body.context && typeof body.context === 'object' ? body.context : {};

  const contents = [];
  if (task === 'copilot') {
    if (context.creative || context.notes) {
      contents.push({ role: 'user', parts: [{ text:
        `Creative in focus: ${context.creative || 'n/a'}\nWhat I know about it: ${context.notes || 'n/a'}` }] });
      contents.push({ role: 'model', parts: [{ text: "Understood — send your question or the change you're weighing." }] });
    }
    for (const m of history) {
      contents.push({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m.text || '').slice(0, 4000) }]
      });
    }
    if (!contents.length) contents.push({ role: 'user', parts: [{ text: 'Hi' }] });
  } else {
    contents.push({ role: 'user', parts: [{ text: 'Metrics snapshot:\n' + JSON.stringify(context, null, 2) }] });
  }

  const payload = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM[task] }] },
    generationConfig: {
      temperature: task === 'insight' ? 0.4 : 0.7,
      maxOutputTokens: 700,
      responseMimeType: 'application/json'
    }
  };

  let data;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(payload) }
    );
    data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || `Gemini HTTP ${r.status}`;
      return res.status(502).json({
        error: msg,
        hint: r.status === 404 ? `Model "${MODEL}" not found — set GEMINI_MODEL to a current id.` : undefined
      });
    }
  } catch (e) {
    return res.status(502).json({ error: 'could not reach Gemini: ' + e.message });
  }

  const raw = ((data.candidates && data.candidates[0] && data.candidates[0].content &&
                data.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim();
  const parsed = looseJson(raw);

  const out = { source: 'gemini', model: MODEL };
  if (parsed && typeof parsed === 'object') {
    out.reply = String(parsed.reply || '').trim() || raw;
    if (Array.isArray(parsed.suggestions)) {
      out.suggestions = parsed.suggestions.slice(0, 3).map((s) => ({
        kind: String(s.kind || 'other').toLowerCase(),
        title: String(s.title || '').trim(),
        detail: String(s.detail || '').trim()
      })).filter((s) => s.title);
    }
  } else {
    out.reply = raw || '(no response)';
  }
  return res.status(200).json(out);
};

function applyCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');
}

function looseJson(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}
