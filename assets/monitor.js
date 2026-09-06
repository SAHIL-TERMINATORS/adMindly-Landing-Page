/* Admindly — Monitoring
 * ----------------------------------------------------------------------------
 * Calls /api/social/insights. For each provider (Instagram / Facebook /
 * YouTube / TikTok) it shows: not set up · not connected (Connect button) ·
 * connected (real KPIs / chart / posts + Disconnect). With nothing connected
 * it keeps the sample data and tags it "sample data".
 * ---------------------------------------------------------------------------- */
(function () {
  var META = document.querySelector('meta[name="admindly:api-base"]');
  var API = (META && META.content || '').replace(/\/$/, '');

  var svg   = document.getElementById('mChart');
  var sub   = document.getElementById('mSub');
  var kpis  = document.getElementById('mKpis');
  var seg   = document.querySelector('.segment[aria-label="Time range"]');
  var tbody = document.querySelector('table.data tbody');
  var thead = document.querySelector('table.data thead tr');
  var connectedPanel = document.querySelector('[data-panel="connected"]');
  var emptyPanel = document.querySelector('[data-panel="empty"]');
  var platformRow = document.querySelector('[data-panel="connected"] .row.center');

  var LABELS = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok' };
  var PF = { instagram: 'ig', youtube: 'yt', tiktok: 'tt' };

  var SAMPLE = {
    30: { sub:'Instagram · 30 days', kpi:[['92.6k','▲ 7% vs prev','up'],['3.4%','▲ 0.2pt','up'],['+1,180','▲ 5%','up'],['texture_closeup_reel','▲ 7.1% eng.','up']],
         a:'8,120 70,104 140,96 210,110 280,72 350,66 420,58 490,80 560,64 632,52',
         b:'8,150 70,148 140,150 210,146 280,150 350,148 420,150 490,150 560,148 632,150', pt:[420,58], peak:'peak: midday test' },
    60: { sub:'Instagram · 60 days', kpi:[['184.2k','▲ 12% vs prev','up'],['3.1%','▼ 0.4pt','down'],['+2,410','▲ 8%','up'],['texture_closeup_reel','▲ 6.8% eng.','up']],
         a:'8,132 70,120 140,126 210,88 280,96 350,60 420,104 490,120 560,112 632,96',
         b:'8,150 70,146 140,140 210,138 280,132 350,128 420,140 490,150 560,150 632,144', pt:[350,60], peak:'peak: reordered hook' },
    90: { sub:'Instagram · 90 days', kpi:[['268.9k','▲ 9% vs prev','up'],['2.8%','▼ 0.6pt','down'],['+3,900','▲ 6%','up'],['founder_pov_post','▲ 5.4% eng.','up']],
         a:'8,150 70,132 140,120 210,96 280,110 350,72 420,116 490,104 560,128 632,120',
         b:'8,156 70,150 140,146 210,150 280,144 350,140 420,150 490,150 560,152 632,150', pt:[350,72], peak:'peak: founder-POV run' }
  };

  var win = 60, active = null, LAST = null;

  /* ---------- helpers ---------- */
  function num(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
  function segWin() {
    var on = seg && seg.querySelector('button.on');
    var n = on ? parseInt(on.textContent, 10) : 60;
    return [30, 60, 90].indexOf(n) >= 0 ? n : 60;
  }
  function setKpis(rows) {
    kpis.querySelectorAll('.kpi').forEach(function (box, i) {
      if (!rows[i]) return;
      box.querySelector('.k-val').textContent = rows[i][0];
      var d = box.querySelector('.k-delta');
      d.textContent = rows[i][1] || ''; d.className = 'k-delta ' + (rows[i][2] || 'up');
    });
  }
  function drawLine(points, peak, peakLabel, ago) {
    svg.querySelector('.area').setAttribute('d', 'M' + points.replace(/ /g, ' L') + ' L632,168 L8,168 Z');
    svg.querySelector('.line-a').setAttribute('points', points);
    var pt = svg.querySelector('.pt');
    if (peak) { pt.setAttribute('cx', peak[0]); pt.setAttribute('cy', peak[1]); pt.style.display = ''; }
    else pt.style.display = 'none';
    var t = svg.querySelectorAll('.axis-t');
    if (t[1]) t[1].textContent = peakLabel || '';
    if (t[2]) t[2].textContent = ago || (win + 'd ago');
  }
  function seriesPoints(values) {
    if (!values || !values.length) return '8,150 632,150';
    var max = Math.max.apply(null, values) || 1, n = values.length;
    return values.map(function (v, i) {
      var x = 8 + 624 * (n === 1 ? 0.5 : i / (n - 1));
      return Math.round(x) + ',' + Math.round(150 - (v / max) * 130);
    }).join(' ');
  }

  /* ---------- render: sample ---------- */
  function renderSample() {
    var d = SAMPLE[win]; if (!d) return;
    sub.textContent = d.sub + ' · sample data';
    drawLine(d.a, d.pt, d.peak, win + 'd ago');
    svg.querySelector('.line-b').setAttribute('points', d.b);
    setKpis(d.kpi);
    if (thead) thead.innerHTML =
      '<th>Creative</th><th class="sortable">Reach</th><th class="sortable on">Engagement ▾</th><th class="sortable">Saves</th><th class="sortable">Follows</th><th>7-day trend</th>';
  }

  /* ---------- render: real ---------- */
  function renderReal(name, data) {
    sub.textContent = LABELS[name] + ' · @' + (data.username || name) + ' · ' + win + ' days';
    setKpis([
      [num(data.reach), 'connected', 'up'],
      [data.engagement_rate == null ? '—' : data.engagement_rate + '%', 'per post', 'up'],
      [data.follower_growth == null ? num(data.followers) + ' total' : (data.follower_growth >= 0 ? '+' : '') + num(data.follower_growth),
        data.follower_growth == null ? 'followers' : 'this window', (data.follower_growth || 0) >= 0 ? 'up' : 'down'],
      [trunc(data.top_post || '—', 18), 'by engagement', 'up']
    ]);
    drawLine(seriesPoints(data.chart), null, 'reach / week', win + 'd ago');
    svg.querySelector('.line-b').setAttribute('points', '8,160 632,160');
    if (thead) thead.innerHTML =
      '<th>Post</th><th>Reach / views</th><th class="sortable on">Engagement ▾</th><th>Likes</th><th>Comments</th><th>Posted</th>';
    if (tbody) tbody.innerHTML = (data.media || []).slice(0, 8).map(function (m) {
      return '<tr><td class="name"><span class="thumb"></span> ' + esc(m.name) + '</td>' +
        '<td>' + num(m.reach) + '</td>' +
        '<td>' + (m.engagement_rate == null ? '—' : m.engagement_rate + '%') + '</td>' +
        '<td>' + num(m.likes) + '</td><td>' + num(m.comments) + '</td>' +
        '<td>' + (m.timestamp ? new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="name">No posts in this window.</td></tr>';
  }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- platform switcher (connected panel) ---------- */
  function renderSwitcher(providers) {
    if (!platformRow) return;
    var connected = Object.keys(providers).filter(function (n) { return providers[n].data; });
    if (!connected.length) {
      platformRow.innerHTML = '<span class="tag">Platform</span>' +
        '<span class="chip on" data-toggle>Sample data</span>';
      return;
    }
    if (!active || connected.indexOf(active) < 0) active = connected[0];
    platformRow.innerHTML = '<span class="tag">Platform</span>' + connected.map(function (n) {
      return '<button class="chip' + (n === active ? ' on' : '') + '" type="button" data-plat="' + n + '">' + LABELS[n] + '</button>';
    }).join('');
    platformRow.querySelectorAll('[data-plat]').forEach(function (b) {
      b.addEventListener('click', function () {
        active = b.getAttribute('data-plat');
        renderSwitcher(providers);
        renderReal(active, providers[active].data);
      });
    });
  }

  /* ---------- connect cards (empty panel) ---------- */
  function renderConnectCards(providers) {
    var grid = emptyPanel && emptyPanel.querySelector('.grid');
    if (!grid) return;
    grid.style.maxWidth = '640px';
    grid.innerHTML = Object.keys(LABELS).map(function (n) {
      var p = providers[n] || {};
      var chip, action;
      if (p.data) {
        chip = '<span class="chip good">Connected · @' + esc(p.username || '') + '</span>';
        action = '<button class="btn ghost sm block" data-disc="' + n + '" type="button">Disconnect</button>';
      } else if (!p.configured) {
        chip = '<span class="chip">Not set up</span>';
        action = '<button class="btn sm block" disabled>API keys needed</button>';
      } else {
        chip = '<span class="chip warn">Not connected</span>';
        action = '<button class="btn primary sm block" data-conn="' + n + '" type="button">Connect ' + LABELS[n] + '</button>';
      }
      return '<div class="connect-card"><span class="pf ' + PF[n] + '">' + n.slice(0, 2).toUpperCase() + '</span>' +
        '<div style="font-weight:600;font-size:13px">' + LABELS[n] + '</div>' + chip + action + '</div>';
    }).join('');
    wireCardButtons();
  }
  function wireCardButtons() {
    document.querySelectorAll('[data-conn]').forEach(function (b) {
      b.addEventListener('click', function () {
        location.href = API + '/api/auth/' + b.getAttribute('data-conn') + '/start?return=/monitoring.html';
      });
    });
    document.querySelectorAll('[data-disc]').forEach(function (b) {
      b.addEventListener('click', function () {
        fetch(API + '/api/social/disconnect', {
          method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: b.getAttribute('data-disc') })
        }).finally(function () { location.href = 'monitoring.html'; });
      });
    });
  }

  /* ---------- banner ---------- */
  function banner(html) {
    var el = document.getElementById('mBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mBanner'; el.className = 'note-strip'; el.style.marginTop = '0';
      connectedPanel.insertBefore(el, connectedPanel.firstChild);
    }
    el.innerHTML = html;
  }
  function flash() {
    var q = new URLSearchParams(location.search);
    if (q.get('social_error')) {
      var e = document.createElement('div');
      e.className = 'ai-note'; e.style.margin = '0 0 14px';
      e.innerHTML = '<div class="ai-body"><b>Couldn’t connect</b> — ' + esc(q.get('social_error')) + '</div>';
      connectedPanel.insertBefore(e, connectedPanel.firstChild);
    }
  }

  /* ---------- boot ---------- */
  win = segWin();
  flash();
  renderSample();

  function load() {
    fetch(API + '/api/social/insights?window=' + win, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        LAST = j;
        renderConnectCards(j.providers || {});
        renderSwitcher(j.providers || {});
        var connected = Object.keys(j.providers || {}).filter(function (n) { return j.providers[n].data; });
        var errs = Object.keys(j.providers || {}).filter(function (n) { return j.providers[n].error; });
        if (connected.length) {
          if (!active || connected.indexOf(active) < 0) active = connected[0];
          renderReal(active, j.providers[active].data);
          var names = connected.map(function (n) { return LABELS[n]; }).join(', ');
          banner('Live data · <b>' + names + '</b>' +
            (errs.length ? ' · ' + errs.map(function (n) { return LABELS[n] + ': ' + esc(j.providers[n].error); }).join(' · ') : '') +
            ' &nbsp;<a class="hint" href="#" id="mManage">manage</a>');
          var mm = document.getElementById('mManage');
          if (mm) mm.addEventListener('click', function (ev) { ev.preventDefault(); document.querySelectorAll('.tabs button')[1].click(); });
        } else {
          renderSample();
          var anyConfigured = Object.keys(j.providers || {}).some(function (n) { return j.providers[n].configured; });
          banner(anyConfigured
            ? 'Showing <b>sample data</b>. Connect a platform in the <a class="hint" href="#" id="mGo">Not connected</a> tab for live numbers.'
            : 'Showing <b>sample data</b>. No social APIs are configured on this deployment yet.');
          var go = document.getElementById('mGo');
          if (go) go.addEventListener('click', function (ev) { ev.preventDefault(); document.querySelectorAll('.tabs button')[1].click(); });
        }
      })
      .catch(function () { renderSample(); banner('Showing <b>sample data</b> (monitoring backend unreachable).'); });
  }
  load();

  if (seg) seg.addEventListener('click', function (e) {
    if (!e.target.closest('button')) return;
    setTimeout(function () {
      win = segWin();
      if (LAST && active && LAST.providers[active] && LAST.providers[active].data) load();
      else renderSample();
    }, 0);
  });
})();
