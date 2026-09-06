/* Admindly — shared infra for the social integrations
 * ----------------------------------------------------------------------------
 * One session cookie -> one Upstash record holding a token per provider:
 *   social:sess:<sid> = { providers: { instagram:{token,...}, youtube:{...} } }
 *
 * Provider adapters live in api/_providers.js. Routes:
 *   /api/auth/<provider>/start      /api/auth/<provider>/callback
 *   /api/social/insights            /api/social/disconnect
 * ---------------------------------------------------------------------------- */
const nodeCrypto = require('crypto');

const COOKIE = 'admindly_sess';
const SESS_TTL = 60 * 24 * 60 * 60; // 60 days

/* ---------- Upstash REST ---------- */
async function redis(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Upstash env not set');
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(command)
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error('redis: ' + (data.error || r.status));
  return data.result;
}
const kv = {
  get: (k) => redis(['GET', k]),
  setex: (k, ttl, v) => redis(['SET', k, v, 'EX', String(ttl)]),
  del: (k) => redis(['DEL', k])
};
function haveStore() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/* ---------- cookies ---------- */
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setCookie(res, name, value, maxAge) {
  const parts = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure'];
  if (maxAge != null) parts.push('Max-Age=' + maxAge);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
}

/* ---------- misc ---------- */
function rand() { return nodeCrypto.randomBytes(24).toString('hex'); }
function host(req) { return req.headers['x-forwarded-host'] || req.headers.host; }
function appBase(req) { return 'https://' + host(req); }
function redirectUri(req, provider) {
  if (process.env[provider.toUpperCase() + '_REDIRECT_URI']) return process.env[provider.toUpperCase() + '_REDIRECT_URI'];
  return appBase(req) + '/api/auth/' + provider + '/callback';
}
function safePath(p) { return /^\/[A-Za-z0-9_\-./]*$/.test(p || '') ? p : null; }

function cors(res, origin) {
  const list = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const ok = list[0] === '*' || !origin || list.includes(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

/* ---------- session ---------- */
async function loadSession(req) {
  const id = parseCookies(req)[COOKIE];
  if (!id) return { id: null, providers: {} };
  let raw;
  try { raw = await kv.get('social:sess:' + id); } catch (e) { return { id, providers: {} }; }
  if (!raw) return { id, providers: {} };
  try { const p = JSON.parse(raw); return { id, providers: p.providers || {} }; }
  catch (e) { return { id, providers: {} }; }
}
async function saveProvider(req, res, provider, data) {
  const sess = await loadSession(req);
  const id = sess.id || rand();
  sess.providers[provider] = { ...data, connected_at: Date.now() };
  await kv.setex('social:sess:' + id, SESS_TTL, JSON.stringify({ providers: sess.providers }));
  setCookie(res, COOKIE, id, SESS_TTL);
  return id;
}
async function removeProvider(req, res, provider) {
  const sess = await loadSession(req);
  if (!sess.id) return;
  delete sess.providers[provider];
  if (Object.keys(sess.providers).length) {
    await kv.setex('social:sess:' + sess.id, SESS_TTL, JSON.stringify({ providers: sess.providers }));
  } else {
    await kv.del('social:sess:' + sess.id);
    setCookie(res, COOKIE, '', 0);
  }
}

/* ---------- generic fetch helper ---------- */
async function httpJson(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { _raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

module.exports = {
  COOKIE, SESS_TTL, kv, haveStore, parseCookies, setCookie, rand, host, appBase,
  redirectUri, safePath, cors, loadSession, saveProvider, removeProvider, httpJson
};
