/* GET  /api/profile        -> { profile: {role,category,brand}|null, categories:[...] }
 * POST /api/profile  {role,category,brand} -> saves onto the session, redrives the
 *                                              category leaderboard membership. */
const S = require('./_social.js');
const LB = require('./_leaderboard.js');

const CATEGORIES = ['Beauty & skincare', 'Fitness & wellness', 'Food & beverage', 'Fashion & apparel', 'Tech & SaaS'];

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

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
};
