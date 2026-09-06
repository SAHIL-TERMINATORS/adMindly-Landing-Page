/* GET /api/login/google/callback — exchange code, read the Google profile,
 * attach the user to the session, redirect back (default /onboarding.html). */
const S = require('../../_social.js');

module.exports = async function handler(req, res) {
  const cookies = S.parseCookies(req);
  const ret = S.safePath(cookies['login_return']) || '/onboarding.html';
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
  if (!code) {
    var got = [...u.searchParams.keys()].join(',') || 'nothing';
    return bail('no code (Google sent: ' + got + ') — add your email as a Test user on the OAuth consent screen, then retry');
  }
  if (!state || state !== cookies['login_state']) return bail('state mismatch — clear this site\'s cookies and retry');

  try {
    const t = await S.httpJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: S.appBase(req) + '/api/login/google/callback',
        grant_type: 'authorization_code'
      })
    });
    if (!t.ok) throw new Error(t.data.error_description || t.data.error || ('token HTTP ' + t.status));

    const info = await S.httpJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: 'Bearer ' + t.data.access_token }
    });
    if (!info.ok) throw new Error('userinfo HTTP ' + info.status);

    await S.saveUser(req, res, {
      sub: info.data.sub,
      email: info.data.email,
      name: info.data.name || info.data.email,
      picture: info.data.picture || null,
      provider: 'google',
      at: Date.now()
    });

    res.statusCode = 302;
    res.setHeader('Location', back);
    res.end();
  } catch (e) {
    bail(e.message || 'sign-in failed');
  }
};
