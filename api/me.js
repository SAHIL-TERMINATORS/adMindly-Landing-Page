/* GET  /api/me          -> { authenticated, user? }
 * POST /api/me  (logout) -> clears the session */
const S = require('./_social.js');

module.exports = async function handler(req, res) {
  S.cors(res, req.headers.origin);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  if (req.method === 'POST') {
    try { await S.clearSession(req, res); } catch (e) {}
    return res.end(JSON.stringify({ ok: true }));
  }

  let sess;
  try { sess = await S.loadSession(req); } catch (e) { sess = { user: null }; }
  const u = sess.user;
  res.end(JSON.stringify(u
    ? { authenticated: true, user: { email: u.email, name: u.name, picture: u.picture } }
    : { authenticated: false }));
};
