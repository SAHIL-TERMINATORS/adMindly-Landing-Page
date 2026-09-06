/* GET /api/auth/instagram/start  →  redirect the user to Instagram's consent screen */
const ig = require('../../_ig.js');

module.exports = async function handler(req, res) {
  if (!ig.configured()) {
    res.statusCode = 503;
    return res.end('Instagram is not configured on this deployment (missing IG_APP_ID / IG_APP_SECRET / Upstash).');
  }
  const state = ig.rand();
  ig.setCookie(res, 'ig_oauth_state', state, 600); // 10 min

  // remember where to send the user back to (same-site path only)
  const ret = (new URL(req.url, 'http://x').searchParams.get('return') || '');
  if (/^\/[A-Za-z0-9_\-./]*$/.test(ret)) ig.setCookie(res, 'ig_return', ret, 600);

  const url = 'https://www.instagram.com/oauth/authorize?' + new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    redirect_uri: ig.redirectUri(req),
    response_type: 'code',
    scope: ig.SCOPES,
    state
  });
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
