/* GET /api/auth/<provider>/start?return=/path
 * Redirects the user to the provider's OAuth consent screen. */
const S = require('../../_social.js');
const PROVIDERS = require('../../_providers.js');

module.exports = async function handler(req, res) {
  const name = String(req.query.provider || '').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) { res.statusCode = 404; return res.end('unknown provider'); }
  if (!provider.configured()) {
    res.statusCode = 503;
    return res.end(provider.label + ' is not set up on this deployment (missing API keys / Upstash).');
  }

  const state = S.rand();
  S.setCookie(res, 'oauth_state', name + ':' + state, 600);
  const ret = S.safePath(new URL(req.url, 'http://x').searchParams.get('return'));
  if (ret) S.setCookie(res, 'oauth_return', ret, 600);

  res.statusCode = 302;
  res.setHeader('Location', provider.authorizeUrl(S.redirectUri(req, name), state));
  res.end();
};
