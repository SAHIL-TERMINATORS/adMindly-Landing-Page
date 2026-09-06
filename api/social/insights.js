/* GET /api/social/insights?window=30|60|90[&platform=instagram]
 * Returns per-provider setup + connection state, and metrics for connected ones.
 *
 * {
 *   providers: {
 *     instagram: { label, configured, connected, username?, data?, error? },
 *     facebook:  { ... }, youtube: { ... }, tiktok: { ... }
 *   },
 *   totals: { followers, reach, engagement_rate },   // summed / averaged across connected
 *   window_days
 * }
 * ---------------------------------------------------------------------------- */
const S = require('../_social.js');
const PROVIDERS = require('../_providers.js');

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const q = new URL(req.url, 'http://x').searchParams;
  const windowDays = [30, 60, 90].includes(+q.get('window')) ? +q.get('window') : 60;
  const only = (q.get('platform') || '').toLowerCase();

  const sess = await S.loadSession(req).catch(() => ({ id: null, providers: {} }));
  const names = Object.keys(PROVIDERS).filter((n) => !only || n === only);

  const providers = {};
  await Promise.all(names.map(async (name) => {
    const adapter = PROVIDERS[name];
    const entry = { label: adapter.label, configured: adapter.configured(), connected: false };
    const p = sess.providers[name];

    if (p && p.token) {
      // refresh if close to expiry and the adapter supports it
      if (adapter.refresh && p.expires_at && p.expires_at - Date.now() < 3 * 86400000) {
        try {
          const r = await adapter.refresh(p);
          if (r && r.token) {
            Object.assign(p, { token: r.token, refresh: r.refresh || p.refresh, expires_at: Date.now() + (r.expires_in || 3600) * 1000 });
            await S.saveProvider(req, res, name, p);
          }
        } catch (e) {}
      }
      entry.connected = true;
      entry.username = p.username || null;
      try {
        entry.data = await adapter.fetchInsights(p, windowDays);
        entry.username = entry.data.username || entry.username;
      } catch (e) {
        entry.error = e.message || 'fetch failed';
      }
    }
    providers[name] = entry;
  }));

  // rough cross-platform totals
  const live = Object.values(providers).filter((e) => e.data);
  const totals = live.length ? {
    followers: sum(live.map((e) => e.data.followers)),
    reach: sum(live.map((e) => e.data.reach)),
    engagement_rate: avg(live.map((e) => e.data.engagement_rate))
  } : null;

  res.statusCode = 200;
  res.end(JSON.stringify({ window_days: windowDays, providers, totals }));
};

function sum(a) { const v = a.filter((x) => typeof x === 'number'); return v.length ? v.reduce((x, y) => x + y, 0) : null; }
function avg(a) { const v = a.filter((x) => typeof x === 'number'); return v.length ? +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) : null; }
