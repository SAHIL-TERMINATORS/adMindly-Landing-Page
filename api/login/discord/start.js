/* GET /api/login/discord/start?return=/path — "Sign in with Discord" */
const S = require('../../_social.js');

module.exports = async function handler(req, res) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !S.haveStore()) {
    res.statusCode = 503;
    return res.end('Discord sign-in is not set up on this deployment.');
  }
  const state = S.rand();
  S.setCookie(res, 'login_state', state, 600);
  const ret = S.safePath(new URL(req.url, 'http://x').searchParams.get('return'));
  if (ret) S.setCookie(res, 'login_return', ret, 600);

  const url = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: S.appBase(req) + '/api/login/discord/callback',
    response_type: 'code',
    scope: 'identify email',
    prompt: 'consent',
    state
  });
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
