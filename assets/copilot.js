/* Admindly — Creative Copilot frontend
 * ----------------------------------------------------------------------------
 * Chat module (per the architecture): a chat interface wired to
 *   - the Creative Library panel (switch the creative in focus)
 *   - per-creative actions: Preview / Edit / Apply (+ Revert)
 *   - the Gemini proxy at <api-base>/api/chat  (see api/chat.js)
 *
 * api-base comes from <meta name="admindly:api-base" content="...">; empty means
 * same origin. If the proxy is unreachable the chat falls back to scripted
 * replies and shows a "demo mode" badge, so the page still works on GitHub Pages.
 *
 * Deep links:  chat.html?creative=<id>   chat.html?brief=<text>
 * ---------------------------------------------------------------------------- */
(function () {
  var META = document.querySelector('meta[name="admindly:api-base"]');
  var API_BASE = (META && META.content || '').replace(/\/$/, '');
  var ENDPOINT = API_BASE + '/api/chat';

  var thread   = document.getElementById('cvThread');
  var composer = document.getElementById('cvComposer');
  var input    = document.getElementById('cvInput');
  var canvas   = document.getElementById('cvCanvas');
  var status   = document.getElementById('cvStatus');
  var focusChip = document.getElementById('cvFocus');
  var versions = document.getElementById('cvVersions');

  /* ---- sample creatives (mirrors library.html) --------------------------- */
  var CREATIVES = [
    { id:'spring_serum_reel', name:'spring_serum_reel.mp4', kind:'reel',
      versions:['v1 · original','v2 · reordered hook'], pending:'v3 · caption',
      desc:'a 0:14 vertical Reel for a skincare brand',
      notes:'Opens on the product on a shelf (no motion/face for the first 2s). Texture close-up at 0:08 is the strongest frame. Current cut is v2 with the hook reordered.' },
    { id:'founder_pov_post', name:'founder_pov_post', kind:'reel',
      versions:['v1 · original'],
      desc:'a founder-to-camera Reel',
      notes:'Handheld, founder in frame from 0:00, spoken hook. One take, no edits yet.' },
    { id:'shelf_static_ad', name:'shelf_static_ad', kind:'static',
      versions:['v1 · original','v2 · new headline'],
      desc:'a static feed ad',
      notes:'Product-on-shelf hero shot with a headline. v2 has a punchier headline; engagement still low.' },
    { id:'ingredient_carousel', name:'ingredient_carousel', kind:'post',
      versions:['v1 · original','v2 · question cover'],
      desc:'a 6-slide carousel',
      notes:'Ingredient breakdown, one claim per slide. v2 opens on a question cover.' },
    { id:'unboxing_reel', name:'unboxing_reel', kind:'reel',
      versions:['v1 · original'],
      desc:'an unboxing Reel',
      notes:'ASMR-style unboxing, no voiceover, slow first frame.' },
    { id:'promo_static_q4', name:'promo_static_q4', kind:'static',
      versions:['v1 · original'],
      desc:'a Q4 promo static',
      notes:'Discount-led promo creative. No feedback yet.' }
  ];
  var current = CREATIVES[0];
  var previewing = false;

  /* ---- helpers --------------------------------------------------------- */
  function setStatus(state) {
    if (!status) return;
    status.textContent = { live:'● live', demo:'○ demo mode', thinking:'· thinking…' }[state] || '';
    status.dataset.state = state;
  }
  function scroll() { if (thread) thread.scrollTop = thread.scrollHeight; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }

  function bubble(role, text) {
    var el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
    el.innerHTML = (role === 'user' ? '' : '<div class="who">Copilot</div>') + '<div class="bubble"></div>';
    el.querySelector('.bubble').textContent = text;
    thread.appendChild(el); scroll();
    return el;
  }
  function sysLine(text, good) {
    var el = document.createElement('div');
    el.className = 'sys-line' + (good ? ' good' : '');
    el.innerHTML = '<span class="ln"></span> ' + esc(text) + ' <span class="ln"></span>';
    thread.appendChild(el); scroll();
  }
  function suggestionCard(s) {
    var el = document.createElement('div');
    el.className = 'sugg';
    el.innerHTML =
      '<span class="s-tag">Suggestion · ' + esc(s.kind || 'idea') + '</span>' +
      '<div style="font-size:13px"><b>' + esc(s.title) + '</b>' + (s.detail ? ' — ' + esc(s.detail) : '') + '</div>' +
      '<div class="s-actions">' +
        '<button class="btn primary sm" type="button" data-apply>Apply edit</button>' +
        '<button class="btn sm" type="button" data-preview>Preview</button>' +
        '<button class="btn ghost sm" type="button" data-dismiss>Dismiss</button>' +
      '</div>';
    thread.appendChild(el); scroll();
  }

  /* ---- conversation ---------------------------------------------------- */
  function history() {
    var out = [];
    thread.querySelectorAll('.msg').forEach(function (m) {
      var b = m.querySelector('.bubble'); if (!b) return;
      var t = b.textContent.trim();
      if (!t || t === '…') return;
      out.push({ role: m.classList.contains('user') ? 'user' : 'model', text: t });
    });
    return out;
  }
  function context() { return { creative: current.name + ' — ' + current.desc, notes: current.notes }; }

  async function ask(hist) {
    var r = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'copilot', history: hist, context: context() })
    });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }
  var FALLBACK = [
    "Good call. Lead with motion in the first frame — the texture shot reads best as a 0.5s push-in.",
    "That works. Keep the on-screen caption to one line so it clears the Reels UI.",
    "Noted. Want me to regenerate with that change and drop a new version in the canvas?",
    "The midday posting slot is the bigger lever here — same creative, 12–2pm, usually +1–2pt engagement."
  ];
  var fb = 0;

  function send(text, opts) {
    opts = opts || {};
    if (!opts.silentUser) bubble('user', text);
    var pending = bubble('ai', '…');
    setStatus('thinking');
    var hist = history();
    if (opts.extra) hist.push({ role: 'user', text: opts.extra });
    ask(hist).then(function (data) {
      pending.querySelector('.bubble').textContent = data.reply || '(no reply)';
      (data.suggestions || []).forEach(suggestionCard);
      setStatus('live'); scroll();
      if (opts.then) opts.then(data);
    }).catch(function (err) {
      pending.querySelector('.bubble').textContent = FALLBACK[fb++ % FALLBACK.length];
      setStatus('demo');
      console.warn('[copilot] scripted fallback:', err.message);
      scroll();
      if (opts.then) opts.then(null);
    });
  }

  if (composer) composer.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (input.value || '').trim(); if (!text) return;
    input.value = ''; send(text);
  });

  /* ---- Creative Library panel --------------------------------------- */
  var panel  = document.getElementById('cvLibPanel');
  var scrim  = document.getElementById('cvLibScrim');
  var list   = document.getElementById('cvLibList');
  var lToggle = document.getElementById('cvLibToggle');

  function renderLibrary() {
    if (!list) return;
    list.innerHTML = CREATIVES.map(function (c) {
      return '<button class="lib-item' + (c === current ? ' on' : '') + '" type="button" data-id="' + c.id + '">' +
        '<span class="li-thumb"></span>' +
        '<span><span class="li-name">' + esc(c.name) + '</span><br><span class="li-meta">' + esc(c.kind) + '</span></span>' +
        '<span class="li-v">' + c.versions.length + (c.versions.length === 1 ? ' version' : ' versions') + '</span>' +
        '</button>';
    }).join('');
  }
  function openPanel(open) {
    if (!panel) return;
    panel.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    if (lToggle) lToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function renderVersions() {
    if (!versions) return;
    var html = current.versions.map(function (v, i) {
      return '<span class="vpill' + (i === current.versions.length - 1 ? ' on' : '') + '">' + esc(v) + '</span>';
    }).join('');
    if (current.pending) html += '<span class="vpill ghost">' + esc(current.pending) + '</span>';
    versions.innerHTML = html;
  }
  function paintCanvas() {
    var v = current.versions[current.versions.length - 1].split(' · ')[0];
    canvas.innerHTML = '<div class="media tall"><span class="pill">current · ' + esc(v) + '</span>' +
      esc(current.name.replace(/\.\w+$/, '')) + ' — preview</div>';
    previewing = false;
    var pv = document.getElementById('cvPreview'); if (pv) pv.setAttribute('aria-pressed', 'false');
  }
  function selectCreative(id, quiet) {
    var c = CREATIVES.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    current = c;
    thread.dataset.creative = c.name + ' — ' + c.desc;
    thread.dataset.notes = c.notes;
    if (focusChip) focusChip.textContent = c.name;
    renderLibrary(); renderVersions(); paintCanvas();
    if (!quiet) sysLine('Creative in focus → ' + c.name, false);
  }

  if (lToggle) lToggle.addEventListener('click', function () { openPanel(!panel.classList.contains('open')); });
  var lClose = document.getElementById('cvLibClose');
  if (lClose) lClose.addEventListener('click', function () { openPanel(false); });
  if (scrim) scrim.addEventListener('click', function () { openPanel(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') openPanel(false); });
  if (list) list.addEventListener('click', function (e) {
    var b = e.target.closest('.lib-item'); if (!b) return;
    selectCreative(b.getAttribute('data-id')); openPanel(false);
  });
  renderLibrary();

  /* ---- Preview / Edit / Apply / Revert ------------------------------- */
  var btnPreview = document.getElementById('cvPreview');
  var btnEdit    = document.getElementById('cvEdit');
  var btnApply   = document.getElementById('cvApply');
  var btnRevert  = document.getElementById('cvRevert');
  var editBox    = document.getElementById('cvEditBox');
  var editInput  = document.getElementById('cvEditInput');

  if (btnPreview) btnPreview.addEventListener('click', function () {
    previewing = !previewing;
    btnPreview.setAttribute('aria-pressed', previewing ? 'true' : 'false');
    if (!previewing) { paintCanvas(); return; }
    var vs = current.versions;
    var before = vs.length > 1 ? vs[vs.length - 2] : vs[0];
    var after  = vs[vs.length - 1];
    canvas.innerHTML =
      '<div class="ba-grid">' +
        '<div><div class="lab">Before · ' + esc(before.split(' · ')[0]) + '</div><div class="media" style="min-height:150px">' + esc(before.split(' · ')[1] || 'original') + '</div></div>' +
        '<div><div class="lab" style="color:var(--blue-hi)">After · ' + esc(after.split(' · ')[0]) + '</div><div class="media" style="min-height:150px;border-color:var(--blue-line)">' + esc(after.split(' · ')[1] || 'current') + '</div></div>' +
      '</div>';
  });

  if (btnEdit) btnEdit.addEventListener('click', function () {
    editBox.hidden = !editBox.hidden;
    if (!editBox.hidden) editInput.focus();
  });
  if (editBox) {
    editBox.addEventListener('submit', function (e) {
      e.preventDefault();
      var instruction = (editInput.value || '').trim(); if (!instruction) return;
      editInput.value = ''; editBox.hidden = true;
      var nextV = 'v' + (current.versions.length + 1) + ' · ' + shortLabel(instruction);
      current.pending = nextV; renderVersions();
      bubble('user', 'Edit: ' + instruction);
      send(instruction, {
        silentUser: true,
        extra: 'Apply this specific edit to "' + current.name + '" and describe the result in one line: ' + instruction,
        then: function () {
          current.versions.push(nextV); current.pending = null;
          renderLibrary(); renderVersions(); paintCanvas();
          sysLine('✓ ' + nextV + ' — regenerated', true);
        }
      });
    });
    editBox.addEventListener('click', function (e) {
      if (e.target.closest('[data-edit-cancel]')) { editBox.hidden = true; }
    });
  }

  if (btnApply) btnApply.addEventListener('click', function () {
    if (current.pending) {
      current.versions.push(current.pending); current.pending = null;
    } else {
      current.versions.push('v' + (current.versions.length + 1) + ' · applied');
    }
    renderLibrary(); renderVersions(); paintCanvas();
    sysLine('✓ Edit applied — creative regenerated as ' + current.versions[current.versions.length - 1].split(' · ')[0], true);
  });

  if (btnRevert) btnRevert.addEventListener('click', function () {
    if (current.versions.length > 1) current.versions.pop();
    current.pending = null;
    renderLibrary(); renderVersions(); paintCanvas();
    sysLine('↩ Reverted to ' + current.versions[current.versions.length - 1].split(' · ')[0], false);
  });

  function shortLabel(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 3).join(' ') || 'edit';
  }

  /* ---- suggestion-card actions (seeded + generated) ------------------ */
  document.addEventListener('click', function (e) {
    var apply = e.target.closest('.sugg [data-apply]');
    if (apply && !apply.disabled) {
      apply.textContent = 'Applied ✓'; apply.classList.remove('primary'); apply.disabled = true;
      var v = 'v' + (current.versions.length + 1) + ' · ' + shortLabel(apply.closest('.sugg').querySelector('b') ? apply.closest('.sugg').querySelector('b').textContent : 'edit');
      current.versions.push(v); current.pending = null;
      renderLibrary(); renderVersions(); paintCanvas();
      sysLine('✓ Edit applied — creative regenerated as ' + v.split(' · ')[0], true);
      return;
    }
    var dismiss = e.target.closest('.sugg [data-dismiss]');
    if (dismiss) { var c = dismiss.closest('.sugg'); if (c) c.remove(); return; }
    var preview = e.target.closest('.sugg [data-preview]');
    if (preview && btnPreview && !previewing) btnPreview.click();
  });

  /* ---- deep links --------------------------------------------------- */
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('creative')) selectCreative(q.get('creative'), true);
    var brief = q.get('brief');
    if (brief) {
      brief = brief.slice(0, 300);
      if (input) { input.value = brief; input.focus(); }
      sysLine('Brief loaded from Competitors — ' + brief, false);
    }
  } catch (e) {}

  renderVersions();

  /* ---- AI explainer notes elsewhere (monitoring / home) ------------- */
  document.querySelectorAll('[data-ai-insight]').forEach(function (el) {
    var metrics; try { metrics = JSON.parse(el.getAttribute('data-metrics') || '{}'); } catch (e) { return; }
    var tag = el.querySelector('.ai-tag');
    fetch(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'insight', context: metrics })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        if (!data || !data.reply) return;
        el.textContent = '';
        if (tag) el.appendChild(tag);
        el.appendChild(document.createTextNode(data.reply));
      }).catch(function () { /* keep the hardcoded fallback */ });
  });

  setStatus('demo');
})();
