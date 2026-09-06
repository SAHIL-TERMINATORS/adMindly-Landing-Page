/* Admindly — Gemini proxy (Cloudflare Worker variant)
 * ----------------------------------------------------------------------------
 * Same contract as api/chat.js. Use this if you host the static site on
 * GitHub Pages and want the AI backend on Cloudflare's free tier.
 *
 *   cd worker && npx wrangler deploy
 *   npx wrangler secret put GEMINI_API_KEY
 *
 * Then point the frontend at it:
 *   <meta name="admindly:api-base" content="https://admindly-proxy.<you>.workers.dev">
 * (the frontend calls  <api-base>/api/chat )
 * ----------------------------------------------------------------------------
 */

const SYSTEM = {
  copilot:
`You are Admindly's Creative Copilot — a blunt, specific creative director for
short-form social video (Reels / TikTok) and static ads. The user brings a
creative and asks for feedback or floats a change.

You cannot see the footage. Reason only from what the user tells you; never
invent shots, timestamps or metrics you weren't given.

Return ONLY minified JSON, no prose around it, matching:
{"reply": string, "suggestions": [{"kind": string, "title": string, "detail": string}]}
- "reply": 2-4 conversational sentences. No preamble.
- "suggestions": 0 to 3 items. "kind" is one of reorder | caption | hook | headline | pacing | other.
  "title" is a short imperative. "detail" is 1-2 actionable sentences.
- If the user is just chatting, return a reply and an empty suggestions array.`,
  insight:
`You are Admindly's analytics explainer. Given a snapshot of a brand's social
metrics, explain the single most likely driver of the change, plainly.
Return ONLY minified JSON matching: {"reply": string} — 2-3 specific sentences.`
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed(env, origin) ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed(env, origin)) return json({ error: 'origin not allowed' }, 403, cors);

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/api/chat')) return json({ error: 'not found' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY is not set on the server' }, 500, cors);

    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    let body = {};
    try { body = await request.json(); } catch (e) {}

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
        contents.push({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text || '').slice(0, 4000) }] });
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
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(payload) }
      );
      data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (data && data.error && data.error.message) || `Gemini HTTP ${r.status}`;
        return json({ error: msg, hint: r.status === 404 ? `Model "${model}" not found — set GEMINI_MODEL.` : undefined }, 502, cors);
      }
    } catch (e) {
      return json({ error: 'could not reach Gemini: ' + e.message }, 502, cors);
    }

    const raw = ((data.candidates && data.candidates[0] && data.candidates[0].content &&
                  data.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim();
    const parsed = looseJson(raw);
    const out = { source: 'gemini', model };
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
    return json(out, 200, cors);
  }
};

function allowed(env, origin) {
  const list = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  return list[0] === '*' || !origin || list.includes(origin);
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
}
function looseJson(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}
