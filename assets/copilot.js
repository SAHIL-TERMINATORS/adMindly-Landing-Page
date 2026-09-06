/* Admindly — Creative Copilot frontend
 * ----------------------------------------------------------------------------
 * Talks to the Gemini proxy at  <api-base>/api/chat  (see api/chat.js).
 * api-base comes from  <meta name="admindly:api-base" content="...">  — empty
 * means same origin. If the proxy is missing or errors, the chat quietly falls
 * back to scripted replies and shows a "demo mode" badge, so the page still
 * works on plain GitHub Pages.
 * ---------------------------------------------------------------------------- */
(function () {
  var META = document.querySelector('meta[name="admindly:api-base"]');
  var API_BASE = (META && META.content || '').replace(/\/$/, '');
  var ENDPOINT = API_BASE + '/api/chat';

  var thread   = document.getElementById('cvThread');
  var composer = document.getElementById('cvComposer');
  var input    = document.getElementById('cvInput');
  var canvas   = document.getElementById('cvCanvas');
  var seg      = document.getElementById('cvSeg');
  var revert   = document.getElementById('cvRevert');
  var status   = document.getElementById('cvStatus');

  var FALLBACK = [
    "Good call. I'd still lead with motion in the first frame — the texture shot reads best as a 0.5s push-in.",
    "That works. Keep the on-screen caption to one line so it clears the Reels UI.",
    "Noted. Want me to regenerate with that change and drop a v3 in the canvas?",
    "The midday posting slot is the bigger lever here — same creative, 12–2pm, usually +1–2pt engagement."
  ];
  var fb = 0;

  function setStatus(state) {
    if (!status) return;
    var map = { live: '● live', demo: '○ demo mode', thinking: '· thinking…' };
    status.textContent = map[state] || '';
    status.dataset.state = state;
  }
  function scroll() { if (thread) thread.scrollTop = thread.scrollHeight; }

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
    el.innerHTML = '<span class="ln"></span> ' + text + ' <span class="ln"></span>';
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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* build the conversation from what's on screen */
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
  function creativeContext() {
    return {
      creative: thread.dataset.creative || 'a social creative',
      notes: thread.dataset.notes || ''
    };
  }

  async function ask(hist) {
    var r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'copilot', history: hist, context: creativeContext() })
    });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  if (composer) {
    composer.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (input.value || '').trim();
      if (!text) return;
      bubble('user', text);
      input.value = '';
      var pending = bubble('ai', '…');
      setStatus('thinking');

      ask(history()).then(function (data) {
        pending.querySelector('.bubble').textContent = data.reply || '(no reply)';
        (data.suggestions || []).forEach(suggestionCard);
        setStatus('live');
        scroll();
      }).catch(function (err) {
        pending.querySelector('.bubble').textContent = FALLBACK[fb++ % FALLBACK.length];
        setStatus('demo');
        console.warn('[copilot] falling back to scripted reply:', err.message);
        scroll();
      });
    });
  }

  /* suggestion card actions (works for seeded + generated cards) */
  document.addEventListener('click', function (e) {
    var apply = e.target.closest('[data-apply]');
    if (apply && !apply.disabled) {
      apply.textContent = 'Applied ✓'; apply.classList.remove('primary'); apply.disabled = true;
      var ghost = document.querySelector('.canvas-body .vpill.ghost');
      if (ghost) ghost.classList.remove('ghost');
      sysLine('✓ Edit applied — creative regenerated', true);
      return;
    }
    var dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) { var card = dismiss.closest('.sugg'); if (card) card.remove(); return; }
    var preview = e.target.closest('[data-preview]');
    if (preview && seg) { seg.querySelectorAll('button')[1].click(); }
  });

  /* canvas: Current  <->  Before / after */
  if (seg && canvas) {
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button'); if (!btn) return;
      if (btn.textContent.trim() === 'Current') {
        canvas.innerHTML = '<div class="media tall"><span class="pill">current · v2</span>spring_serum_reel — preview</div>';
      } else {
        canvas.innerHTML =
          '<div class="ba-grid">' +
            '<div><div class="lab">Before · v1</div><div class="media" style="min-height:150px">shelf intro</div></div>' +
            '<div><div class="lab" style="color:var(--blue-hi)">After · v2</div><div class="media" style="min-height:150px;border-color:var(--blue-line)">texture-first</div></div>' +
          '</div>';
      }
    });
  }
  if (revert && canvas) {
    revert.addEventListener('click', function () {
      canvas.innerHTML = '<div class="media tall"><span class="pill">current · v1</span>back to original</div>';
      document.querySelectorAll('.canvas-body .vpill').forEach(function (p, i) { p.classList.toggle('on', i === 0); });
      sysLine('↩ Reverted to v1 · original', false);
    });
  }

  /* ai-generated explainer notes elsewhere in the app  ------------------------
     <div class="ai-body" data-ai-insight data-metrics='{"reach":"…"}'> fallback text </div>  */
  document.querySelectorAll('[data-ai-insight]').forEach(function (el) {
    var metrics; try { metrics = JSON.parse(el.getAttribute('data-metrics') || '{}'); } catch (e) { return; }
    var tag = el.querySelector('.ai-tag'); // keep the label, replace the rest
    fetch(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'insight', context: metrics })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        if (!data || !data.reply) return;
        el.textContent = '';
        if (tag) el.appendChild(tag);
        el.appendChild(document.createTextNode(data.reply));
      }).catch(function () { /* keep the hardcoded fallback text */ });
  });

  /* first paint: assume demo until a call proves otherwise */
  setStatus('demo');
})();
