/* Admindly — social provider adapters
 * ----------------------------------------------------------------------------
 * Each adapter:
 *   configured()                         -> bool (required env present)
 *   authorizeUrl(redirectUri, state)     -> string
 *   exchangeCode(code, redirectUri)      -> { token, refresh?, expires_in, account_id?, username? }
 *   refresh(p)                            -> { token, expires_in } | null   (optional)
 *   fetchInsights(p, windowDays)          -> normalised metrics object
 *
 * Normalised metrics:
 *   { platform, username, followers, reach, engagement_rate, follower_growth,
 *     top_post, media:[{name,reach,engagement_rate,likes,comments,timestamp}],
 *     chart:[n], partial, notes:[] }
 * ---------------------------------------------------------------------------- */
const S = require('./_social.js');

const day = 86400;
const now = () => Math.floor(Date.now() / 1000);
const env = (k) => process.env[k];

function weekly(rows, days, valueKey) {
  const buckets = Math.max(1, Math.round(days / 7));
  const out = new Array(buckets).fill(0);
  const t = Date.now();
  rows.forEach((r) => {
    const age = (t - new Date(r.timestamp).getTime()) / (day * 1000);
    const b = buckets - 1 - Math.min(buckets - 1, Math.floor(age / 7));
    out[b] += (r[valueKey] || 0);
  });
  return out;
}
function caption(s, fallback) {
  const t = String(s || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return t || fallback;
}

/* ============================== INSTAGRAM ============================== */
const instagram = {
  label: 'Instagram',
  scopes: 'instagram_business_basic,instagram_business_manage_insights',
  configured: () => !!(env('IG_APP_ID') && env('IG_APP_SECRET') && S.haveStore()),
  authorizeUrl(redirectUri, state) {
    return 'https://www.instagram.com/oauth/authorize?' + new URLSearchParams({
      client_id: env('IG_APP_ID'), redirect_uri: redirectUri,
      response_type: 'code', scope: this.scopes, state
    });
  },
  async exchangeCode(code, redirectUri) {
    const t = await S.httpJson('https://api.instagram.com/oauth/access_token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('IG_APP_ID'), client_secret: env('IG_APP_SECRET'),
        grant_type: 'authorization_code', redirect_uri: redirectUri, code
      })
    });
    if (!t.ok || t.data.error_type) throw new Error('IG token: ' + (t.data.error_message || t.status));
    const ll = await S.httpJson('https://graph.instagram.com/access_token?' + new URLSearchParams({
      grant_type: 'ig_exchange_token', client_secret: env('IG_APP_SECRET'), access_token: t.data.access_token
    }));
    if (!ll.ok) throw new Error('IG long-lived: ' + (ll.data.error && ll.data.error.message || ll.status));
    return { token: ll.data.access_token, expires_in: ll.data.expires_in || S.SESS_TTL, account_id: t.data.user_id };
  },
  async refresh(p) {
    const r = await S.httpJson('https://graph.instagram.com/refresh_access_token?' + new URLSearchParams({
      grant_type: 'ig_refresh_token', access_token: p.token
    }));
    return r.ok ? { token: r.data.access_token, expires_in: r.data.expires_in } : null;
  },
  async fetchInsights(p, windowDays) {
    const g = (path, params) => S.httpJson('https://graph.instagram.com/v21.0/' + path + '?' +
      new URLSearchParams({ ...params, access_token: p.token }));
    const out = { platform: 'instagram', username: p.username, partial: false, notes: [] };

    const acc = await g(p.account_id || 'me', { fields: 'username,account_type,followers_count,media_count' });
    if (acc.ok) { out.username = acc.data.username; out.followers = acc.data.followers_count; }
    else { out.notes.push('profile: ' + msg(acc)); out.partial = true; }

    const since = now() - windowDays * day;
    const fg = await g((p.account_id || 'me') + '/insights', { metric: 'follower_count', period: 'day', since, until: now() });
    out.follower_growth = fg.ok
      ? (((fg.data.data || [])[0] || {}).values || []).reduce((a, v) => a + (v.value || 0), 0)
      : null;

    const media = await g((p.account_id || 'me') + '/media', {
      fields: 'id,caption,media_type,timestamp,like_count,comments_count,insights.metric(reach,saved,shares,total_interactions)',
      limit: 50
    });
    if (media.ok) {
      const cutoff = Date.now() - windowDays * day * 1000;
      const rows = (media.data.data || []).filter((m) => new Date(m.timestamp).getTime() >= cutoff).map((m) => {
        const ins = {};
        ((m.insights && m.insights.data) || []).forEach((d) => { ins[d.name] = (d.values && d.values[0] || {}).value || 0; });
        const reach = ins.reach || 0;
        const inter = ins.total_interactions || (m.like_count || 0) + (m.comments_count || 0) + (ins.saved || 0);
        return { name: caption(m.caption, (m.media_type || 'post').toLowerCase()), reach,
          likes: m.like_count || 0, comments: m.comments_count || 0, interactions: inter,
          engagement_rate: reach ? +(inter / reach * 100).toFixed(1) : null, timestamp: m.timestamp };
      });
      finalize(out, rows, windowDays);
    } else { out.notes.push('media: ' + msg(media)); out.partial = true; }
    return out;
  }
};

/* ============================== FACEBOOK ============================== */
const GRAPH = 'https://graph.facebook.com/v21.0';
const facebook = {
  label: 'Facebook',
  scopes: 'pages_show_list,pages_read_engagement,read_insights',
  configured: () => !!(env('META_APP_ID') && env('META_APP_SECRET') && S.haveStore()),
  authorizeUrl(redirectUri, state) {
    return 'https://www.facebook.com/v21.0/dialog/oauth?' + new URLSearchParams({
      client_id: env('META_APP_ID'), redirect_uri: redirectUri, state, response_type: 'code', scope: this.scopes
    });
  },
  async exchangeCode(code, redirectUri) {
    const t = await S.httpJson(GRAPH + '/oauth/access_token?' + new URLSearchParams({
      client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), redirect_uri: redirectUri, code
    }));
    if (!t.ok) throw new Error('FB token: ' + msg(t));
    const ll = await S.httpJson(GRAPH + '/oauth/access_token?' + new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: env('META_APP_ID'),
      client_secret: env('META_APP_SECRET'), fb_exchange_token: t.data.access_token
    }));
    const userToken = ll.ok ? ll.data.access_token : t.data.access_token;
    const pages = await S.httpJson(GRAPH + '/me/accounts?' + new URLSearchParams({
      fields: 'name,id,access_token', access_token: userToken
    }));
    const page = pages.ok && (pages.data.data || [])[0];
    return {
      token: page ? page.access_token : userToken,
      user_token: userToken,
      expires_in: (ll.ok && ll.data.expires_in) || 60 * day,
      account_id: page ? page.id : null,
      username: page ? page.name : null,
      no_page: !page
    };
  },
  async fetchInsights(p, windowDays) {
    const out = { platform: 'facebook', username: p.username, partial: false, notes: [] };
    if (!p.account_id) { out.partial = true; out.notes.push('No Facebook Page on this account — create one to see Page insights.'); return out; }
    const g = (path, params) => S.httpJson(GRAPH + '/' + path + '?' + new URLSearchParams({ ...params, access_token: p.token }));
    const since = now() - windowDays * day;

    const info = await g(p.account_id, { fields: 'name,fan_count,followers_count' });
    if (info.ok) { out.username = info.data.name; out.followers = info.data.followers_count || info.data.fan_count; }

    const ins = await g(p.account_id + '/insights', { metric: 'page_impressions_unique,page_post_engagements', period: 'day', since, until: now() });
    if (ins.ok) {
      const byName = {};
      (ins.data.data || []).forEach((d) => { byName[d.name] = (d.values || []).reduce((a, v) => a + (v.value || 0), 0); });
      out.reach = byName.page_impressions_unique || 0;
      const eng = byName.page_post_engagements || 0;
      out.engagement_rate = out.reach ? +(eng / out.reach * 100).toFixed(1) : null;
    } else { out.notes.push('insights: ' + msg(ins)); out.partial = true; }

    const posts = await g(p.account_id + '/posts', {
      fields: 'message,created_time,insights.metric(post_impressions_unique,post_engaged_users)', limit: 25
    });
    if (posts.ok) {
      const cutoff = Date.now() - windowDays * day * 1000;
      const rows = (posts.data.data || []).filter((m) => new Date(m.created_time).getTime() >= cutoff).map((m) => {
        const x = {};
        ((m.insights && m.insights.data) || []).forEach((d) => { x[d.name] = (d.values && d.values[0] || {}).value || 0; });
        const reach = x.post_impressions_unique || 0;
        return { name: caption(m.message, 'post'), reach, interactions: x.post_engaged_users || 0,
          engagement_rate: reach ? +((x.post_engaged_users || 0) / reach * 100).toFixed(1) : null,
          timestamp: m.created_time };
      });
      finalize(out, rows, windowDays, true);
    }
    return out;
  }
};

/* ============================== YOUTUBE ============================== */
const youtube = {
  label: 'YouTube',
  scopes: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
  configured: () => !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && S.haveStore()),
  authorizeUrl(redirectUri, state) {
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code',
      scope: this.scopes, access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent', state
    });
  },
  async exchangeCode(code, redirectUri) {
    const t = await S.httpJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri, grant_type: 'authorization_code'
      })
    });
    if (!t.ok) throw new Error('YT token: ' + msg(t));
    return { token: t.data.access_token, refresh: t.data.refresh_token, expires_in: t.data.expires_in || 3600 };
  },
  async refresh(p) {
    if (!p.refresh) return null;
    const t = await S.httpJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: p.refresh, client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token'
      })
    });
    return t.ok ? { token: t.data.access_token, expires_in: t.data.expires_in } : null;
  },
  async fetchInsights(p, windowDays) {
    const out = { platform: 'youtube', username: p.username, partial: false, notes: [] };
    const auth = { headers: { authorization: 'Bearer ' + p.token } };
    const ch = await S.httpJson('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', auth);
    if (ch.ok && (ch.data.items || [])[0]) {
      const c = ch.data.items[0];
      out.username = c.snippet.title;
      out.followers = +c.statistics.subscriberCount || 0;
      out._channelViews = +c.statistics.viewCount || 0;
    } else { out.notes.push('channel: ' + msg(ch)); out.partial = true; }

    const iso = (d) => d.toISOString().slice(0, 10);
    const start = iso(new Date(Date.now() - windowDays * day * 1000));
    const end = iso(new Date());
    const rep = await S.httpJson('https://youtubeanalytics.googleapis.com/v2/reports?' + new URLSearchParams({
      ids: 'channel==MINE', startDate: start, endDate: end,
      metrics: 'views,estimatedMinutesWatched,subscribersGained', dimensions: 'day'
    }), auth);
    if (rep.ok && rep.data.rows) {
      const rows = rep.data.rows;
      out.reach = rows.reduce((a, r) => a + (r[1] || 0), 0);            // views in window
      out.follower_growth = rows.reduce((a, r) => a + (r[3] || 0), 0);  // subscribersGained
      out.chart = weeklyFromDaily(rows.map((r) => ({ timestamp: r[0], v: r[1] })), windowDays, 'v');
    } else { out.notes.push('analytics: ' + msg(rep)); out.partial = true; }

    const vids = await S.httpJson('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
      part: 'snippet', forMine: 'true', type: 'video', order: 'date', maxResults: '15'
    }), auth);
    if (vids.ok && vids.data.items) {
      const ids = vids.data.items.map((i) => i.id.videoId).filter(Boolean).join(',');
      const stats = await S.httpJson('https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=' + ids, auth);
      const rows = ((stats.ok && stats.data.items) || []).map((v) => {
        const views = +v.statistics.viewCount || 0;
        const inter = (+v.statistics.likeCount || 0) + (+v.statistics.commentCount || 0);
        return { name: caption(v.snippet.title, 'video'), reach: views,
          likes: +v.statistics.likeCount || 0, comments: +v.statistics.commentCount || 0, interactions: inter,
          engagement_rate: views ? +(inter / views * 100).toFixed(1) : null, timestamp: v.snippet.publishedAt };
      });
      out.media = rows;
      const top = rows.slice().sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))[0];
      out.top_post = top ? top.name : null;
      if (out.engagement_rate == null && rows.length) {
        const tv = rows.reduce((a, r) => a + r.reach, 0), ti = rows.reduce((a, r) => a + r.interactions, 0);
        out.engagement_rate = tv ? +(ti / tv * 100).toFixed(1) : null;
      }
    }
    return out;
  }
};

/* ============================== TIKTOK ============================== */
const TT = 'https://open.tiktokapis.com/v2';
const tiktok = {
  label: 'TikTok',
  scopes: 'user.info.basic,user.info.stats,video.list',
  configured: () => !!(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET') && S.haveStore()),
  authorizeUrl(redirectUri, state) {
    return 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
      client_key: env('TIKTOK_CLIENT_KEY'), redirect_uri: redirectUri,
      response_type: 'code', scope: this.scopes, state
    });
  },
  async exchangeCode(code, redirectUri) {
    const t = await S.httpJson(TT + '/oauth/token/', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'),
        code, grant_type: 'authorization_code', redirect_uri: redirectUri
      })
    });
    if (!t.ok || t.data.error) throw new Error('TikTok token: ' + (t.data.error_description || t.data.error || t.status));
    return { token: t.data.access_token, refresh: t.data.refresh_token, expires_in: t.data.expires_in || 86400, account_id: t.data.open_id };
  },
  async refresh(p) {
    if (!p.refresh) return null;
    const t = await S.httpJson(TT + '/oauth/token/', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'),
        refresh_token: p.refresh, grant_type: 'refresh_token'
      })
    });
    return t.ok && !t.data.error ? { token: t.data.access_token, refresh: t.data.refresh_token, expires_in: t.data.expires_in } : null;
  },
  async fetchInsights(p, windowDays) {
    const out = { platform: 'tiktok', username: p.username, partial: false, notes: [] };
    const auth = { headers: { authorization: 'Bearer ' + p.token } };
    const info = await S.httpJson(TT + '/user/info/?fields=display_name,follower_count,likes_count,video_count', auth);
    if (info.ok && info.data.data && info.data.data.user) {
      const u = info.data.data.user;
      out.username = u.display_name;
      out.followers = u.follower_count;
      out._likes = u.likes_count;
    } else { out.notes.push('user: ' + msg(info)); out.partial = true; }

    const vids = await S.httpJson(TT + '/video/list/?fields=id,title,like_count,comment_count,share_count,view_count,create_time', {
      method: 'POST', headers: { authorization: 'Bearer ' + p.token, 'content-type': 'application/json' },
      body: JSON.stringify({ max_count: 20 })
    });
    if (vids.ok && vids.data.data && vids.data.data.videos) {
      const cutoff = Date.now() - windowDays * day * 1000;
      const rows = vids.data.data.videos
        .filter((v) => v.create_time * 1000 >= cutoff)
        .map((v) => {
          const views = v.view_count || 0;
          const inter = (v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0);
          return { name: caption(v.title, 'video'), reach: views, likes: v.like_count || 0,
            comments: v.comment_count || 0, shares: v.share_count || 0, interactions: inter,
            engagement_rate: views ? +(inter / views * 100).toFixed(1) : null,
            timestamp: new Date(v.create_time * 1000).toISOString() };
        });
      finalize(out, rows, windowDays);
    } else { out.notes.push('videos: ' + msg(vids)); out.partial = true; }
    return out;
  }
};

/* ---------- shared helpers ---------- */
function msg(r) {
  return (r.data && (r.data.error && (r.data.error.message || r.data.error) || r.data.error_message)) || ('HTTP ' + r.status);
}
function finalize(out, rows, windowDays, engFromField) {
  out.media = rows;
  const totalReach = rows.reduce((a, r) => a + (r.reach || 0), 0);
  const totalInter = rows.reduce((a, r) => a + (r.interactions || 0), 0);
  if (out.reach == null) out.reach = totalReach;
  if (out.engagement_rate == null) out.engagement_rate = totalReach ? +(totalInter / totalReach * 100).toFixed(1) : null;
  const top = rows.slice().sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))[0];
  out.top_post = top ? top.name : null;
  out.chart = weekly(rows, windowDays, 'reach');
}
function weeklyFromDaily(rows, days, key) {
  const buckets = Math.max(1, Math.round(days / 7));
  const out = new Array(buckets).fill(0);
  const t = Date.now();
  rows.forEach((r) => {
    const age = (t - new Date(r.timestamp).getTime()) / (day * 1000);
    const b = buckets - 1 - Math.min(buckets - 1, Math.floor(age / 7));
    out[b] += (r[key] || 0);
  });
  return out;
}

module.exports = { instagram, facebook, youtube, tiktok };
