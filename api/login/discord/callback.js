/* GET /api/login/discord/callback — exchange code, read the Discord profile,
 * attach the user to the session, redirect back (default /home.html). */
const S = require('../../_social.js');

module.exports = async function handler(req, res) {
  const cookies = S.parseCookies(req);
  const ret = S.safePath(cookies['login_return']) || '/home.html';
  const back = S.appBase(req) + ret;
  S.setCookie(res, 'login_state', '', 0);
  S.setCookie(res, 'login_return', '', 0);

  const bail = (m) => {
    res.statusCode = 302;
    res.setHeader('Location', S.appBase(req) + '/auth.html?login_error=' + encodeURIComponent(m));
    res.end();
  };

  const u = new URL(req.url, S.appBase(req));
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error_description') || u.searchParams.get('error');
  const state = u.searchParams.get('state');
  if (err) return bail(err);
  if (!code) return bail('no code returned');
  if (!state || state !== cookies['login_state']) return bail('state mismatch — clear this site\'s cookies and retry');

  try {
    const t = await S.httpJson('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        redirect_uri: S.appBase(req) + '/api/login/discord/callback',
        grant_type: 'authorization_code'
      })
    });
    if (!t.ok) throw new Error(t.data.error_description || t.data.error || ('token HTTP ' + t.status));

    const info = await S.httpJson('https://discord.com/api/users/@me', {
      headers: { authorization: 'Bearer ' + t.data.access_token }
    });
    if (!info.ok) throw new Error('userinfo HTTP ' + info.status);

    const avatar = info.data.avatar
      ? 'https://cdn.discordapp.com/avatars/' + info.data.id + '/' + info.data.avatar + '.png'
      : null;

    await S.saveUser(req, res, {
      sub: info.data.id,
      email: info.data.email || null,
      name: info.data.global_name || info.data.username,
      picture: avatar,
      provider: 'discord',
      at: Date.now()
    });

    res.statusCode = 302;
    res.setHeader('Location', back);
    res.end();
  } catch (e) {
    bail(e.message || 'sign-in failed');
  }
};
