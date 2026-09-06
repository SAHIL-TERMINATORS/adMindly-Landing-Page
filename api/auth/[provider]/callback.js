/* GET /api/auth/<provider>/callback?code=&state=
 * Exchanges the code, stores the token per-provider on the session, redirects back. */
const S = require('../../_social.js');
const PROVIDERS = require('../../_providers.js');

module.exports = async function handler(req, res) {
  const name = String(req.query.provider || '').toLowerCase();
  const provider = PROVIDERS[name];
  const cookies = S.parseCookies(req);
  const ret = S.safePath(cookies['oauth_return']) || '/monitoring.html';
  const back = S.appBase(req) + ret;

  S.setCookie(res, 'oauth_state', '', 0);
  S.setCookie(res, 'oauth_return', '', 0);

  const bail = (m) => {
    res.statusCode = 302;
    res.setHeader('Location', back + (ret.includes('?') ? '&' : '?') + 'social_error=' + encodeURIComponent(name + ': ' + m));
    res.end();
  };
  if (!provider) return bail('unknown provider');

  const u = new URL(req.url, S.appBase(req));
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error_description') || u.searchParams.get('error');
  const state = u.searchParams.get('state');
  const [wantName, wantState] = (cookies['oauth_state'] || '').split(':');

  if (err) return bail(err);
  if (!code) return bail('no code returned');
  if (wantName !== name || !state || state !== wantState) return bail('state mismatch — try again');

  try {
    const tok = await provider.exchangeCode(code, S.redirectUri(req, name));
    await S.saveProvider(req, res, name, {
      token: tok.token,
      user_token: tok.user_token || null,
      refresh: tok.refresh || null,
      account_id: tok.account_id || null,
      username: tok.username || null,
      no_page: tok.no_page || false,
      expires_at: Date.now() + (tok.expires_in || S.SESS_TTL) * 1000
    });
    res.statusCode = 302;
    res.setHeader('Location', back + (ret.includes('?') ? '&' : '?') + 'social_connected=' + name);
    res.end();
  } catch (e) {
    bail(e.message || 'connection failed');
  }
};
