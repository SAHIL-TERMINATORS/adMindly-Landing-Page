/* Admindly — shared shell + theme
   ------------------------------------------------------------------
   - Injects the sidebar + topbar into pages that set
     <body data-page="chat" data-title="Creative Copilot">.
   - Pages with data-chrome="none" (auth, onboarding, prototype) keep
     their own layout but still get the theme toggle wired.
   - Theme: a tiny inline <head> script sets data-theme before paint;
     this file wires every [data-theme-toggle] button and remembers
     the choice in localStorage.
   ------------------------------------------------------------------ */

(function () {
  var STORE_KEY = 'admindly-theme';

  var ICONS = {
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 1 1 21 11.5Z"/>',
    monitoring: '<path d="M4 19V6m5 13V10m5 9V4m5 15v-7"/>',
    competitors: '<path d="M4 5h16M4 12h10M4 19h7"/><circle cx="18" cy="14" r="3"/><path d="m20 16 2 2"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4m8-4v4"/>',
    library: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M3 12h6"/>',
    alerts: '<path d="M18 8a6 6 0 0 0-12 0c0 6-2.5 8-2.5 8h17S18 14 18 8ZM13.7 20a2 2 0 0 1-3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    home: '<path d="M4 11 12 4l8 7M6 10v9h12v-9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'
  };

  var NAV = [
    { group: 'Workspace' },
    { id: 'chat', label: 'Creative Copilot', href: 'chat.html', icon: 'chat' },
    { id: 'monitoring', label: 'Monitoring', href: 'monitoring.html', icon: 'monitoring' },
    { id: 'competitors', label: 'Competitors', href: 'competitors.html', icon: 'competitors' },
    { id: 'calendar', label: 'Content Calendar', href: 'calendar.html', icon: 'calendar' },
    { group: 'Assets' },
    { id: 'library', label: 'Creative Library', href: 'library.html', icon: 'library' },
    { id: 'notifications', label: 'Notifications', href: 'notifications.html', icon: 'alerts', count: '3' }
  ];

  function svg(path, cls) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '>' + path + '</svg>';
  }

  /* ---------------------------------------------------------------- theme */
  function storedTheme() {
    try { var t = localStorage.getItem(STORE_KEY); return (t === 'dark' || t === 'light') ? t : null; }
    catch (e) { return null; }
  }
  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function currentTheme() { return storedTheme() || systemTheme(); }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(STORE_KEY, t); } catch (e) {}
  }
  function toggleTheme() { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }

  function themeToggleBtn() {
    return '<button class="theme-toggle" data-theme-toggle type="button" aria-label="Toggle light / dark theme" title="Toggle theme">' +
      svg(ICONS.sun, 'i-sun') + svg(ICONS.moon, 'i-moon') +
      '</button>';
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) { toggleTheme(); }
  });

  /* ---------------------------------------------------------------- shell */
  function buildSidebar(page) {
    var items = NAV.map(function (n) {
      if (n.group) return '<div class="nav-group">' + n.group + '</div>';
      var active = n.id === page ? ' active' : '';
      return '<a class="nav-item' + active + '" href="' + n.href + '"' + (active ? ' aria-current="page"' : '') + '>' +
        svg(ICONS[n.icon]) + '<span>' + n.label + '</span>' +
        (n.count ? '<span class="count">' + n.count + '</span>' : '') +
        '</a>';
    }).join('');

    return '' +
      '<a class="brand" href="home.html">' +
        '<span class="logo">A</span>' +
        '<span><span class="name">Admindly</span><span class="env">PROTOTYPE · v1</span></span>' +
      '</a>' +
      items +
      '<div class="spacer"></div>' +
      '<div class="side-card">' +
        '<div class="sc-title">Connected accounts</div>' +
        '<div class="sc-row"><span class="dot on"></span> Instagram · @lumen.skincare</div>' +
        '<div class="sc-row"><span class="dot on"></span> Facebook · Lumen Skincare</div>' +
        '<div class="sc-row"><span class="dot off"></span> TikTok · not connected</div>' +
      '</div>' +
      '<a class="nav-item" href="prototype.html" style="margin-top:8px">' + svg(ICONS.home) + '<span>Flow map</span></a>' +
      '<a class="nav-item" href="index.html">' + svg(ICONS.search) + '<span>Back to site</span></a>';
  }

  function buildTopbar(title) {
    return '' +
      '<button class="nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false">' + svg(ICONS.menu) + '</button>' +
      '<span class="crumb">Admindly /</span><h1>' + (title || '') + '</h1>' +
      '<div class="tb-right">' +
        '<div class="search">' + svg(ICONS.search) + '<span>Search creatives, competitors…</span></div>' +
        themeToggleBtn() +
        '<a class="icon-btn" href="notifications.html" aria-label="Notifications">' + svg(ICONS.alerts) + '<span class="badge">3</span></a>' +
        '<button class="avatar" id="tbAvatar" type="button" title="Account">SJ</button>' +
      '</div>';
  }

  var API_BASE = (function () {
    var m = document.querySelector('meta[name="admindly:api-base"]');
    return (m && m.content || '').replace(/\/$/, '');
  })();

  function initials(name) {
    return (name || '').trim().split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase() || 'SJ';
  }
  function wireUser() {
    fetch(API_BASE + '/api/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var av = document.getElementById('tbAvatar');
        if (!av) return;
        if (d && d.authenticated) {
          av.textContent = initials(d.user.name);
          av.title = d.user.name + ' · click to sign out';
          av.addEventListener('click', function () {
            if (!confirm('Sign out ' + d.user.email + '?')) return;
            fetch(API_BASE + '/api/me', { method: 'POST', credentials: 'include' })
              .finally(function () { location.href = 'auth.html'; });
          });
          document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = d.user.name.split(' ')[0]; });
          document.querySelectorAll('[data-user-email]').forEach(function (el) { el.textContent = d.user.email; });
        } else {
          av.addEventListener('click', function () { location.href = 'auth.html'; });
        }
      }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    var body = document.body;
    if (body.getAttribute('data-chrome') === 'none') return;

    var page = body.getAttribute('data-page') || '';
    var title = body.getAttribute('data-title') || '';

    var app = document.querySelector('.app');
    if (!app) return;

    var side = document.createElement('aside');
    side.className = 'sidebar';
    side.innerHTML = buildSidebar(page);
    app.insertBefore(side, app.firstChild);

    var main = app.querySelector('.main');
    if (main) {
      var top = document.createElement('header');
      top.className = 'topbar';
      top.innerHTML = buildTopbar(title);
      main.insertBefore(top, main.firstChild);
      wireUser();
    }

    /* mobile drawer */
    var scrim = document.createElement('div');
    scrim.className = 'sidebar-scrim';
    document.body.appendChild(scrim);

    var toggle = main && main.querySelector('.nav-toggle');
    function setOpen(open) {
      side.classList.toggle('open', open);
      scrim.classList.toggle('show', open);
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (toggle) toggle.addEventListener('click', function () { setOpen(!side.classList.contains('open')); });
    scrim.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    side.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  });

  /* --------------------------------------------- prototype toggles (tabs / segments / chips) */
  document.addEventListener('click', function (e) {
    var seg = e.target.closest('.segment button, .tabs button, .auth-toggle button, .chip[data-toggle]');
    if (!seg) return;
    var parent = seg.parentElement;
    if (seg.matches('.chip[data-toggle]')) { seg.classList.toggle('on'); return; }
    parent.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
    seg.classList.add('on');
    seg.setAttribute('aria-selected', 'true');

    var target = seg.getAttribute('data-tab');
    if (target) {
      var scope = seg.closest('[data-tabscope]') || document;
      scope.querySelectorAll('[data-panel]').forEach(function (p) {
        p.hidden = p.getAttribute('data-panel') !== target;
      });
    }
  });
})();
