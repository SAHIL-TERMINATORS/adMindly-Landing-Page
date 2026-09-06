/* Admindly — shared helpers for the Instagram integration
 * ----------------------------------------------------------------------------
 * Instagram API with Instagram Login ("Business Login").
 * Token store: Upstash Redis via its REST API (no SDK, no build step).
 *
 * Env:
 *   IG_APP_ID, IG_APP_SECRET            – Meta app → Instagram → Business login settings
 *   IG_REDIRECT_URI                     – optional; defaults to https://<host>/api/auth/instagram/callback
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   ALLOWED_ORIGINS                     – optional CORS allowlist (default "*")
 * ---------------------------------------------------------------------------- */

const nodeCrypto = require('crypto');
const GRAPH = 'https://graph.instagram.com';
const IG_VER = 'v21.0';
const SCOPES = 'instagram_business_basic,instagram_business_manage_insights';
const COOKIE = 'ig_sess';
const SESS_TTL = 60 * 24 * 60 * 60; // 60 days, matches a long-lived token

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

/* ---------- config ---------- */
function redirectUri(req) {
  if (process.env.IG_REDIRECT_URI) return process.env.IG_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return 'https://' + host + '/api/auth/instagram/callback';
}
function appBase(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return 'https://' + host;
}
function configured() {
  return !!(process.env.IG_APP_ID && process.env.IG_APP_SECRET &&
            process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
function rand() {
  return nodeCrypto.randomBytes(24).toString('hex');
}

/* ---------- session ---------- */
async function loadSession(req) {
  const id = parseCookies(req)[COOKIE];
  if (!id) return null;
  const raw = await kv.get('ig:sess:' + id);
  if (!raw) return null;
  try { return { id, ...JSON.parse(raw) }; } catch (e) { return null; }
}
async function saveSession(res, id, data) {
  await kv.setex('ig:sess:' + id, SESS_TTL, JSON.stringify(data));
  setCookie(res, COOKIE, id, SESS_TTL);
}

/* ---------- Instagram Graph ---------- */
async function igGet(path, token, params) {
  const u = new URL(GRAPH + '/' + IG_VER + '/' + path);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set('access_token', token);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok || data.error) throw new Error('ig: ' + (data.error && data.error.message || r.status));
  return data;
}

async function exchangeCode(code, req) {
  const body = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    client_secret: process.env.IG_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(req),
    code
  });
  const r = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await r.json();
  if (!r.ok || data.error_type) throw new Error('token exchange: ' + (data.error_message || r.status));
  // -> { access_token, user_id, permissions }
  const long = await fetch(GRAPH + '/access_token?' + new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.IG_APP_SECRET,
    access_token: data.access_token
  }));
  const ld = await long.json();
  if (!long.ok || ld.error) throw new Error('long-lived exchange: ' + (ld.error && ld.error.message || long.status));
  return { token: ld.access_token, expires_in: ld.expires_in || SESS_TTL, user_id: data.user_id };
}

function cors(res, origin) {
  const list = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const ok = list[0] === '*' || !origin || list.includes(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

module.exports = {
  SCOPES, COOKIE, SESS_TTL, kv, parseCookies, setCookie, redirectUri, appBase,
  configured, rand, loadSession, saveSession, igGet, exchangeCode, cors, IG_VER, GRAPH
};
