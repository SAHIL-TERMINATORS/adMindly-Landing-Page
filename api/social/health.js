/* GET /api/social/health — quick diagnostics for the social backend */
const S = require('../_social.js');
const PROVIDERS = require('../_providers.js');

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');

  const out = { store: { configured: S.haveStore() }, providers: {} };
  if (S.haveStore()) {
    try {
      const k = 'social:health:' + Date.now();
      await S.kv.setex(k, 30, 'ok');
      const v = await S.kv.get(k);
      await S.kv.del(k);
      out.store.write = v === 'ok';
      out.store.ok = v === 'ok';
    } catch (e) {
      out.store.ok = false;
      out.store.error = String(e.message || e);
    }
  }
  for (const name of Object.keys(PROVIDERS)) {
    out.providers[name] = { configured: PROVIDERS[name].configured() };
  }
  res.statusCode = 200;
  res.end(JSON.stringify(out, null, 2));
};
