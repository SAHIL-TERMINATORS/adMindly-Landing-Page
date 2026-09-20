/* Admindly — cross-user category leaderboard
 * ----------------------------------------------------------------------------
 * Real snapshots only. A member is written here by api/social/insights.js
 * whenever a session has BOTH a category (set via api/profile.js, from
 * onboarding) AND at least one connected provider with real fetched data —
 * never from sample/scripted data. api/profile.js (the /api/competitors
 * route, merged in to stay under Vercel's per-deployment function cap)
 * reads it back.
 *
 *   lb:<slug>:members        Redis SET of session ids
 *   lb:<slug>:m:<sessionId>  Redis STRING (JSON snapshot), TTL-bound
 * ---------------------------------------------------------------------------- */
const S = require('./_social.js');

const MEMBER_TTL = 21 * 24 * 60 * 60; // re-upserted every time Monitoring/insights loads

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
}

async function upsert(sessionId, category, entry) {
  if (!sessionId || !category) return;
  const slug = slugify(category);
  await S.raw(['SADD', 'lb:' + slug + ':members', sessionId]);
  await S.raw(['SET', 'lb:' + slug + ':m:' + sessionId, JSON.stringify(entry), 'EX', String(MEMBER_TTL)]);
}

async function removeFrom(sessionId, category) {
  if (!sessionId || !category) return;
  const slug = slugify(category);
  await S.raw(['SREM', 'lb:' + slug + ':members', sessionId]);
  await S.raw(['DEL', 'lb:' + slug + ':m:' + sessionId]);
}

async function list(category, limit) {
  const slug = slugify(category);
  const ids = (await S.raw(['SMEMBERS', 'lb:' + slug + ':members'])) || [];
  if (!ids.length) return [];
  const keys = ids.map((id) => 'lb:' + slug + ':m:' + id);
  const rows = (await S.raw(['MGET', ...keys])) || [];
  const out = [];
  const stale = [];
  ids.forEach((id, i) => {
    const v = rows[i];
    if (!v) { stale.push(id); return; }
    try { out.push({ session_id: id, ...JSON.parse(v) }); } catch (e) { stale.push(id); }
  });
  if (stale.length) S.raw(['SREM', 'lb:' + slug + ':members'].concat(stale)).catch(() => {});
  out.sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0));
  return limit ? out.slice(0, limit) : out;
}

module.exports = { slugify, upsert, removeFrom, list };
