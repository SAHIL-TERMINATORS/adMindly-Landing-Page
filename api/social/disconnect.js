/* POST /api/social/disconnect  { provider }  → drop that provider's token */
const S = require('../_social.js');
const PROVIDERS = require('../_providers.js');

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST only' })); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const name = String((body && body.provider) || '').toLowerCase();
  if (!PROVIDERS[name]) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'unknown provider' })); }

  try { await S.removeProvider(req, res, name); } catch (e) {}
  res.end(JSON.stringify({ ok: true }));
};
