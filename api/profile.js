/* GET/POST /api/profile — role/category/brand saved on the session.
 *
 * Also serves GET /api/competitors (rewritten here via vercel.json as
 * /api/profile?_ep=competitors&category=...) — the real per-category
 * cross-user leaderboard. Combined into one function so this project stays
 * under Vercel Hobby's serverless-function-per-deployment cap.
 *
 * GET  /api/profile        -> { profile: {role,category,brand}|null, categories:[...] }
 * POST /api/profile        {role,category,brand} -> saves onto the session
 * GET  /api/competitors?category=<name>
 *   -> { category, count, members:[{name,role,platform,username,followers,
 *        engagement_rate,follower_growth,top_post,is_you,updated_at}],
 *        trending:[{name,by,engagement_rate,reach}] }
 *   Members only ever come from api/social/insights.js, when a session has
 *   a saved category AND at least one connected provider with real fetched
 *   data — never scripted/sample rows.
 * ---------------------------------------------------------------------------- */
const S = require('./_social.js');
const LB = require('./_leaderboard.js');

const CATEGORIES = ['Beauty & skincare', 'Fitness & wellness', 'Food & beverage', 'Fashion & apparel', 'Tech & SaaS'];

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('_ep') === 'competitors') return competitors(req, res, url);
  return profile(req, res);
};

async function profile(req, res) {
  const sess = await S.loadSession(req).catch(() => ({ id: null, user: null, profile: null }));

  if (req.method === 'GET') {
    res.statusCode = 200;
    return res.end(JSON.stringify({ profile: sess.profile || null, categories: CATEGORIES }));
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'GET or POST only' }));
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const role = String(body.role || '').trim().slice(0, 40) || 'Marketer';
  const category = CATEGORIES.includes(body.category) ? body.category : CATEGORIES[0];
  const brand = String(body.brand || '').trim().slice(0, 80) || (sess.user && sess.user.name) || 'Your brand';

  const oldCategory = sess.profile && sess.profile.category;
  const id = await S.saveProfile(req, res, { role, category, brand });
  if (oldCategory && oldCategory !== category) LB.removeFrom(id, oldCategory).catch(() => {});

  res.statusCode = 200;
  res.end(JSON.stringify({ profile: { role, category, brand } }));
}

async function competitors(req, res, url) {
  const sess = await S.loadSession(req).catch(() => ({ id: null, profile: null }));
  const category = url.searchParams.get('category') || (sess.profile && sess.profile.category) || null;

  if (!category) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      category: null, count: 0, members: [], trending: [],
      message: 'Set your category in onboarding to see the leaderboard for it.'
    }));
  }

  const rows = await LB.list(category, 50);
  const members = rows.map((m) => {
    const out = { ...m, is_you: !!(sess.id && m.session_id === sess.id) };
    delete out.session_id;
    return out;
  });

  const trending = members
    .filter((m) => m.top_post && m.top_post.name)
    .map((m) => ({ name: m.top_post.name, by: m.name, engagement_rate: m.top_post.engagement_rate, reach: m.top_post.reach }))
    .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
    .slice(0, 6);

  res.statusCode = 200;
  res.end(JSON.stringify({ category, count: members.length, members, trending }));
}
