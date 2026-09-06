/* GET /api/auth/instagram/callback?code=&state=
 * Exchanges the code for a long-lived token, stores it, sets a session cookie,
 * and sends the user back to /monitoring.html. */
const ig = require('../../_ig.js');

module.exports = async function handler(req, res) {
  const u = new URL(req.url, ig.appBase(req));
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const err = u.searchParams.get('error_description') || u.searchParams.get('error');
  const cookieState = ig.parseCookies(req)['ig_oauth_state'];
  const back = ig.appBase(req) + '/monitoring.html';

  ig.setCookie(res, 'ig_oauth_state', '', 0); // clear it

  function bail(msg) {
    res.statusCode = 302;
    res.setHeader('Location', back + '?ig_error=' + encodeURIComponent(msg));
    res.end();
  }
  if (err) return bail(err);
  if (!code) return bail('no code returned');
  if (!state || state !== cookieState) return bail('state mismatch');

  try {
    const { token, expires_in, user_id } = await ig.exchangeCode(code, req);
    const me = await ig.igGet('me', token, { fields: 'user_id,username,account_type' });

    const sid = ig.rand();
    await ig.saveSession(res, sid, {
      token,
      ig_user_id: me.user_id || user_id,
      username: me.username || null,
      account_type: me.account_type || null,
      connected_at: Date.now(),
      expires_at: Date.now() + expires_in * 1000
    });

    res.statusCode = 302;
    res.setHeader('Location', back + '?ig_connected=1');
    res.end();
  } catch (e) {
    bail(e.message || 'connection failed');
  }
};
