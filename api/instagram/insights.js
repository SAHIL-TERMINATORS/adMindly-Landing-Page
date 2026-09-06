/* GET /api/instagram/insights?window=30|60|90
 * Returns normalised metrics for the connected Instagram account, or
 * { connected:false } so the frontend can show the "connect" state / sample data. */
const ig = require('../_ig.js');

module.exports = async function handler(req, res) {
  ig.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const send = (obj, code) => { res.statusCode = code || 200; res.end(JSON.stringify(obj)); };

  if (!ig.configured()) return send({ connected: false, reason: 'not_configured' });

  let sess;
  try { sess = await ig.loadSession(req); } catch (e) { return send({ connected: false, reason: 'store_error' }); }
  if (!sess || !sess.token) return send({ connected: false, reason: 'no_session' });
  if (sess.expires_at && sess.expires_at < Date.now()) {
    try { await ig.kv.del('ig:sess:' + sess.id); } catch (e) {}
    return send({ connected: false, reason: 'expired' });
  }

  const windowDays = [30, 60, 90].includes(+((new URL(req.url, 'http://x')).searchParams.get('window'))) ?
    +((new URL(req.url, 'http://x')).searchParams.get('window')) : 30;
  const token = sess.token;
  const uid = sess.ig_user_id || 'me';
  const notes = [];
  const out = {
    connected: true,
    username: sess.username,
    account_type: sess.account_type,
    window_days: windowDays,
    partial: false
  };

  /* --- account profile --- */
  try {
    const acc = await ig.igGet(uid, token, { fields: 'username,account_type,followers_count,follows_count,media_count' });
    out.username = acc.username || out.username;
    out.followers = acc.followers_count;
    out.media_count = acc.media_count;
  } catch (e) { notes.push('profile: ' + e.message); out.partial = true; }

  /* --- follower growth over the window (daily deltas) --- */
  try {
    const until = Math.floor(Date.now() / 1000);
    const since = until - windowDays * 86400;
    const fg = await ig.igGet(uid + '/insights', token, {
      metric: 'follower_count', period: 'day', since, until
    });
    const values = (((fg.data || [])[0] || {}).values || []).map((v) => v.value || 0);
    out.follower_growth = values.reduce((a, b) => a + b, 0);
  } catch (e) { out.follower_growth = null; notes.push('follower_growth: ' + e.message); }

  /* --- recent media + per-post engagement --- */
  try {
    const cutoff = Date.now() - windowDays * 86400 * 1000;
    const media = await ig.igGet(uid + '/media', token, {
      fields: 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,' +
              'insights.metric(reach,saved,shares,total_interactions)',
      limit: 50
    });
    const rows = (media.data || [])
      .filter((m) => new Date(m.timestamp).getTime() >= cutoff)
      .map((m) => {
        const ins = {};
        ((m.insights && m.insights.data) || []).forEach((d) => { ins[d.name] = (d.values && d.values[0] && d.values[0].value) || 0; });
        const reach = ins.reach || 0;
        const interactions = ins.total_interactions || ((m.like_count || 0) + (m.comments_count || 0) + (ins.saved || 0) + (ins.shares || 0));
        return {
          name: label(m),
          type: (m.media_product_type || m.media_type || '').toLowerCase(),
          timestamp: m.timestamp,
          reach,
          likes: m.like_count || 0,
          comments: m.comments_count || 0,
          saved: ins.saved || 0,
          shares: ins.shares || 0,
          interactions,
          engagement_rate: reach ? +(interactions / reach * 100).toFixed(1) : null,
          permalink: m.permalink
        };
      });
    out.media = rows;

    const totalReach = rows.reduce((a, r) => a + r.reach, 0);
    const totalInter = rows.reduce((a, r) => a + r.interactions, 0);
    out.reach = totalReach;
    out.engagement_rate = totalReach ? +(totalInter / totalReach * 100).toFixed(1) : null;
    const top = rows.slice().sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))[0];
    out.top_post = top ? top.name : null;
    // coarse trend: reach per week bucket
    out.chart = weekly(rows, windowDays);
  } catch (e) { notes.push('media: ' + e.message); out.partial = true; }

  if (notes.length) out.notes = notes;
  return send(out);
};

function label(m) {
  const t = (m.caption || '').replace(/\s+/g, ' ').trim().slice(0, 28);
  return t || (m.media_type || 'post').toLowerCase() + '_' + String(m.id).slice(-4);
}
function weekly(rows, days) {
  const buckets = Math.max(1, Math.round(days / 7));
  const now = Date.now();
  const out = new Array(buckets).fill(0);
  rows.forEach((r) => {
    const age = (now - new Date(r.timestamp).getTime()) / (86400 * 1000);
    const b = buckets - 1 - Math.min(buckets - 1, Math.floor(age / 7));
    out[b] += r.reach;
  });
  return out;
}
