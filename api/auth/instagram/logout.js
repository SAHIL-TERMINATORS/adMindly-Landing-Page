/* POST /api/auth/instagram/logout  →  drop the stored token + session */
const ig = require('../../_ig.js');

module.exports = async function handler(req, res) {
  ig.cors(res, req.headers.origin);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const sid = ig.parseCookies(req)[ig.COOKIE];
  if (sid) { try { await ig.kv.del('ig:sess:' + sid); } catch (e) {} }
  ig.setCookie(res, ig.COOKIE, '', 0);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
};
