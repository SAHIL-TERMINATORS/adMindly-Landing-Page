/* Admindly — Monitoring
 * ----------------------------------------------------------------------------
 * On load, asks /api/instagram/insights. If an Instagram account is connected
 * it swaps the sample KPIs / chart / table for real numbers. Otherwise it wires
 * the "Connect with OAuth" button and keeps the sample data (demo mode).
 * ---------------------------------------------------------------------------- */
(function () {
  var META = document.querySelector('meta[name="admindly:api-base"]');
  var API = (META && META.content || '').replace(/\/$/, '');

  var svg  = document.getElementById('mChart');
  var sub  = document.getElementById('mSub');
  var kpis = document.getElementById('mKpis');
  var seg  = document.querySelector('.segment[aria-label="Time range"]');
  var tbody = document.querySelector('#connected table.data tbody') || document.querySelector('table.data tbody');
  var thead = document.querySelector('table.data thead tr');
  var connectedPanel = document.querySelector('[data-panel="connected"]');

  /* ---------- sample data (demo / not connected) ---------- */
  var SAMPLE = {
    30: { sub:'Instagram · 30 days', kpi:[['92.6k','▲ 7% vs prev','up'],['3.4%','▲ 0.2pt vs prev','up'],['+1,180','▲ 5%','up'],['texture_closeup_reel','▲ 7.1% eng.','up']],
         a:'8,120 70,104 140,96 210,110 280,72 350,66 420,58 490,80 560,64 632,52',
         b:'8,150 70,148 140,150 210,146 280,150 350,148 420,150 490,150 560,148 632,150', pt:[420,58], peak:'peak: midday test' },
    60: { sub:'Instagram · 60 days', kpi:[['184.2k','▲ 12% vs prev','up'],['3.1%','▼ 0.4pt vs prev','down'],['+2,410','▲ 8%','up'],['texture_closeup_reel','▲ 6.8% eng.','up']],
         a:'8,132 70,120 140,126 210,88 280,96 350,60 420,104 490,120 560,112 632,96',
         b:'8,150 70,146 140,140 210,138 280,132 350,128 420,140 490,150 560,150 632,144', pt:[350,60], peak:'peak: reordered hook' },
    90: { sub:'Instagram · 90 days', kpi:[['268.9k','▲ 9% vs prev','up'],['2.8%','▼ 0.6pt vs prev','down'],['+3,900','▲ 6%','up'],['founder_pov_post','▲ 5.4% eng.','up']],
         a:'8,150 70,132 140,120 210,96 280,110 350,72 420,116 490,104 560,128 632,120',
         b:'8,156 70,150 140,146 210,150 280,144 350,140 420,150 490,150 560,152 632,150', pt:[350,72], peak:'peak: founder-POV run' }
  };

  var connected = false;
  var win = 60;

  function segToWindow() {
    var on = seg && seg.querySelector('button.on');
    var n = on ? parseInt(on.textContent, 10) : 60;
    return [30, 60, 90].indexOf(n) >= 0 ? n : 60;
  }

  /* ---------- chart drawing ---------- */
  function drawPolyline(pointsStr, peakXY, peakLabel, agoLabel) {
    svg.querySelector('.area').setAttribute('d', 'M' + pointsStr.replace(/ /g, ' L') + ' L632,168 L8,168 Z');
    svg.querySelector('.line-a').setAttribute('points', pointsStr);
    var pt = svg.querySelector('.pt');
    if (peakXY) { pt.setAttribute('cx', peakXY[0]); pt.setAttribute('cy', peakXY[1]); pt.style.display = ''; }
    else pt.style.display = 'none';
    var texts = svg.querySelectorAll('.axis-t');
    if (texts[1]) texts[1].textContent = peakLabel || '';
    if (texts[2]) texts[2].textContent = agoLabel || (win + 'd ago');
  }
  function seriesToPoints(values) {
    if (!values || !values.length) return '8,150 632,150';
    var max = Math.max.apply(null, values) || 1;
    var n = values.length;
    return values.map(function (v, i) {
      var x = 8 + (624 * (n === 1 ? 0.5 : i / (n - 1)));
      var y = 150 - (v / max) * 130;
      return Math.round(x) + ',' + Math.round(y);
    }).join(' ');
  }

  /* ---------- KPI + table ---------- */
  function setKpis(rows) {
    kpis.querySelectorAll('.kpi').forEach(function (box, i) {
      if (!rows[i]) return;
      box.querySelector('.k-val').textContent = rows[i][0];
      var d = box.querySelector('.k-delta');
      d.textContent = rows[i][1] || '';
      d.className = 'k-delta ' + (rows[i][2] || 'up');
    });
  }
  function num(n) {
    if (n == null) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  function setTable(media) {
    if (!tbody) return;
    if (thead) thead.innerHTML =
      '<th>Creative</th><th>Reach</th><th class="sortable on">Engagement ▾</th><th>Saves</th><th>Shares</th><th>Posted</th>';
    tbody.innerHTML = media.slice(0, 8).map(function (m) {
      return '<tr><td class="name"><span class="thumb"></span> ' + escapeHtml(m.name) + '</td>' +
        '<td>' + num(m.reach) + '</td>' +
        '<td>' + (m.engagement_rate == null ? '—' : m.engagement_rate + '%') + '</td>' +
        '<td>' + num(m.saved) + '</td>' +
        '<td>' + num(m.shares) + '</td>' +
        '<td>' + new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="name">No posts in this window.</td></tr>';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }

  /* ---------- render: sample ---------- */
  function renderSample() {
    var d = SAMPLE[win]; if (!d) return;
    sub.textContent = d.sub + ' · sample data';
    drawPolyline(d.a, d.pt, d.peak, win + 'd ago');
    svg.querySelector('.line-b').setAttribute('points', d.b);
    setKpis(d.kpi);
  }

  /* ---------- render: real ---------- */
  function renderReal(data) {
    sub.textContent = '@' + (data.username || 'instagram') + ' · ' + data.window_days + ' days';
    setKpis([
      [num(data.reach), 'connected', 'up'],
      [data.engagement_rate == null ? '—' : data.engagement_rate + '%', 'per post', 'up'],
      [data.follower_growth == null ? '—' : (data.follower_growth >= 0 ? '+' : '') + num(data.follower_growth), 'this window', data.follower_growth >= 0 ? 'up' : 'down'],
      [truncate(data.top_post || '—', 18), 'by engagement', 'up']
    ]);
    drawPolyline(seriesToPoints(data.chart), null, 'reach / week', data.window_days + 'd ago');
    svg.querySelector('.line-b').setAttribute('points', '8,160 632,160');
    setTable(data.media || []);
    banner('Connected as <b>@' + escapeHtml(data.username || '') + '</b>' +
      (data.partial ? ' · some metrics unavailable' : '') +
      ' &nbsp;<button class="btn ghost sm" id="igDisconnect" type="button">Disconnect</button>');
  }
  function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- connect banner ---------- */
  function banner(html) {
    var el = document.getElementById('igBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'igBanner';
      el.className = 'note-strip';
      el.style.marginTop = '0';
      connectedPanel.insertBefore(el, connectedPanel.firstChild);
    }
    el.innerHTML = html;
    var dc = document.getElementById('igDisconnect');
    if (dc) dc.addEventListener('click', function () {
      fetch(API + '/api/auth/instagram/logout', { method: 'POST', credentials: 'include' })
        .finally(function () { location.href = 'monitoring.html'; });
    });
  }

  function wireConnect() {
    document.querySelectorAll('[data-panel="empty"] .connect-card').forEach(function (card) {
      var isIg = /instagram/i.test(card.textContent);
      var btn = card.querySelector('button');
      if (!btn) return;
      if (isIg) {
        btn.addEventListener('click', function () { location.href = API + '/api/auth/instagram/start'; });
      } else {
        btn.disabled = true; btn.textContent = 'Coming soon';
      }
    });
    // also expose a connect action on the connected panel while in demo mode
    banner('Showing <b>sample data</b>. <button class="btn primary sm" id="igConnect" type="button">Connect Instagram</button> for live numbers.');
    var c = document.getElementById('igConnect');
    if (c) c.addEventListener('click', function () { location.href = API + '/api/auth/instagram/start'; });
  }

  function urlFlash() {
    var q = new URLSearchParams(location.search);
    if (q.get('ig_error')) {
      var e = document.createElement('div');
      e.className = 'ai-note'; e.style.margin = '0 0 14px';
      e.innerHTML = '<div class="ai-body"><b>Instagram didn’t connect</b> — ' + escapeHtml(q.get('ig_error')) + '</div>';
      connectedPanel.insertBefore(e, connectedPanel.firstChild);
    }
  }

  /* ---------- boot ---------- */
  win = segToWindow();
  urlFlash();
  renderSample();

  function load() {
    fetch(API + '/api/instagram/insights?window=' + win, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        if (data && data.connected) { connected = true; renderReal(data); }
        else { connected = false; wireConnect(); }
      })
      .catch(function () { connected = false; wireConnect(); });
  }
  load();

  if (seg) seg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setTimeout(function () {
      win = segToWindow();
      if (connected) load(); else renderSample();
    }, 0);
  });
})();
