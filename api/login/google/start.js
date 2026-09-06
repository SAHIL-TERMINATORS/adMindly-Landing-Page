/* GET /api/login/google/start?return=/path — "Sign in with Google" */
const S = require('../../_social.js');

module.exports = async function handler(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !S.haveStore()) {
    res.statusCode = 503;
    return res.end('Google sign-in is not set up on this deployment.');
  }
  const state = S.rand();
  S.setCookie(res, 'login_state', state, 600);
  const ret = S.safePath(new URL(req.url, 'http://x').searchParams.get('return'));
  if (ret) S.setCookie(res, 'login_return', ret, 600);

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: S.appBase(req) + '/api/login/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state
  });
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
