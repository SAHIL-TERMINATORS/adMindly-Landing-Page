/* GET /api/competitors?category=<name>
 * Real cross-user leaderboard for a category — members only enter this list
 * from api/social/insights.js, when they have a saved category AND at least
 * one connected provider with real fetched data. No scripted/sample rows.
 *
 * -> { category, count, members:[{name,role,platform,username,followers,
 *      engagement_rate,follower_growth,top_post,is_you,updated_at}],
 *      trending:[{name,by,engagement_rate,reach}] }
 * ---------------------------------------------------------------------------- */
const S = require('./_social.js');
const LB = require('./_leaderboard.js');

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const sess = await S.loadSession(req).catch(() => ({ id: null, profile: null }));
  const q = new URL(req.url, 'http://x').searchParams;
  const category = q.get('category') || (sess.profile && sess.profile.category) || null;

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
};
