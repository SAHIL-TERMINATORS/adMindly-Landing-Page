/* Admindly prototype — shared shell (sidebar + topbar) injection
   Each page sets <body data-page="chat" data-title="Creative Copilot">.
   Pages with data-chrome="none" (auth, onboarding) are skipped. */

(function () {
  var ICONS = {
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 1 1 21 11.5Z"/>',
    monitoring: '<path d="M4 19V6m5 13V10m5 9V4m5 15v-7"/>',
    competitors: '<path d="M4 5h16M4 12h10M4 19h7"/><circle cx="18" cy="14" r="3"/><path d="m20 16 2 2"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4m8-4v4"/>',
    library: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M3 12h6"/>',
    alerts: '<path d="M18 8a6 6 0 0 0-12 0c0 6-2.5 8-2.5 8h17S18 14 18 8ZM13.7 20a2 2 0 0 1-3.4 0"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.5 3.6-5.5 8-5.5s8 2 8 5.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    home: '<path d="M4 11 12 4l8 7M6 10v9h12v-9"/>'
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
    return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '>' + path + '</svg>';
  }

  function buildSidebar(page) {
    var items = NAV.map(function (n) {
      if (n.group) return '<div class="nav-group">' + n.group + '</div>';
      var active = n.id === page ? ' active' : '';
      return '<a class="nav-item' + active + '" href="' + n.href + '">' +
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
      '<a class="nav-item" href="index.html" style="margin-top:8px">' + svg(ICONS.home) + '<span>Flow map</span></a>';
  }

  function buildTopbar(title) {
    return '' +
      '<span class="crumb">Admindly /</span><h1>' + (title || '') + '</h1>' +
      '<div class="tb-right">' +
        '<div class="search">' + svg(ICONS.search) + '<span>Search creatives, competitors…</span></div>' +
        '<a class="icon-btn" href="notifications.html" aria-label="Notifications">' + svg(ICONS.alerts) + '<span class="badge">3</span></a>' +
        '<span class="avatar">SJ</span>' +
      '</div>';
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
    }
  });

  /* tiny interaction helpers for prototype toggles (segments / tabs / auth) */
  document.addEventListener('click', function (e) {
    var seg = e.target.closest('.segment button, .tabs button, .auth-toggle button, .chip[data-toggle]');
    if (!seg) return;
    var parent = seg.parentElement;
    if (seg.matches('.chip[data-toggle]')) { seg.classList.toggle('on'); return; }
    parent.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
    seg.classList.add('on');

    var target = seg.getAttribute('data-tab');
    if (target) {
      var scope = seg.closest('[data-tabscope]') || document;
      scope.querySelectorAll('[data-panel]').forEach(function (p) {
        p.hidden = p.getAttribute('data-panel') !== target;
      });
    }
  });
})();
