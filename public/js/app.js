/* ============================================================================
   OQAS — shared client helpers
   Icon pack: uniform inline SVG set (Feather-style, stroke-based, MIT).
   No emojis anywhere — every glyph below comes from this one pack.
   ============================================================================ */
(function () {
  'use strict';

  /* ---------------- icon pack (single, uniform 24×24 stroke set) ----------- */
  var P = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    timer: '<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    bellOff: '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    barChart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11.5 11.5 14 15.5 9.5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    alertTriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    lightbulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    presentation: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="M12 16v5"/><path d="M8 21h8"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    clipboardCheck: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 14 11 16 15 12"/>',
    externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    helpCircle: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'
  };
  window.icon = function (name, size) {
    var s = size || 18;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.info) + '</svg>';
  };

  /* ---------------- token storage (localStorage w/ safe fallback) --------- */
  var Store = (function () {
    try {
      localStorage.setItem('__oqas_test', '1');
      localStorage.removeItem('__oqas_test');
      return localStorage;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) { return (k in mem) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();
  window.Store = Store;
  window.getToken = function () { return Store.getItem('oqas_token'); };
  window.setToken = function (t) { t ? Store.setItem('oqas_token', t) : Store.removeItem('oqas_token'); };

  /* ---------------- API wrapper ------------------------------------------- */
  async function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var res = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body });
    var body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error((body && body.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      throw err;
    }
    return body;
  }
  window.api = api;
  window.GET = function (p) { return api(p); };
  window.POST = function (p, b) { return api(p, { method: 'POST', body: JSON.stringify(b || {}) }); };
  window.PUT = function (p, b) { return api(p, { method: 'PUT', body: JSON.stringify(b || {}) }); };
  window.DEL = function (p) { return api(p, { method: 'DELETE', body: '{}' }); };

  /* ---------------- formatting helpers ----------------------------------- */
  window.$ = function (s, r) { return (r || document).querySelector(s); };
  window.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  window.LETTER = function (i) { return String.fromCharCode(65 + Number(i)); };
  window.fmtPct = function (x) { return (x == null) ? '—' : (Math.round(x * 10) / 10) + '%'; };
  window.fmtWhen = function (ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  window.fmtAgo = function (ts) {
    if (!ts) return '';
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  };
  window.fmtDur = function (s) {
    if (s == null) return '—';
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  };
  window.fmtClock = function (s) {
    s = Math.max(0, Math.ceil(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  };

  /* ---------------- auth guard ------------------------------------------- */
  window.requireLogin = async function (role) {
    var me = null;
    try { me = await GET('/api/auth/me'); } catch (e) {}
    if (!me || !me.user) {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
      throw new Error('redirecting to login');
    }
    if (role && me.user.role !== role) {
      location.href = me.user.role === 'teacher' ? 'teacher.html' : 'dashboard.html';
      throw new Error('redirecting by role');
    }
    return me.user;
  };

  /* ---------------- sidebar (+ teacher notification bell) ----------------- */
  var LOGO = '<svg width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#1a73e8"/><path d="M30 55l14 14 26-30" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var navUser = null, navActive = null;
  window.navbar = function (user, active) {
    var el = document.getElementById('nav');
    if (!el) return;
    navUser = user;
    navActive = active;
    var isTeacher = user.role === 'teacher';
    var home = isTeacher ? 'teacher.html' : 'dashboard.html';
    var initials = user.name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();

    function item(key, href, ic, label) {
      return '<a class="sb-item' + (active === key ? ' on' : '') + '" href="' + href + '">' +
        icon(ic, 18) + '<span>' + label + '</span></a>';
    }
    var links = isTeacher ? [
      item('dashboard', 'teacher.html', 'home', 'Dashboard'),
      item('students', 'students.html', 'users', 'Students'),
      item('create', 'builder.html?new=1', 'plus', 'Create quiz')
    ] : [
      item('dashboard', 'dashboard.html', 'home', 'Dashboard'),
      item('results', 'dashboard.html#results', 'fileText', 'My results'),
      item('leaderboard', 'dashboard.html#leaderboard', 'award', 'Leaderboard')
    ];

    el.innerHTML =
      '<aside class="sidebar">' +
      '<div class="sb-head">' +
      '<a class="brand" href="' + home + '" title="OQAS home">' + LOGO + '<span>OQAS</span></a>' +
      '<div class="bellwrap"><button class="iconbtn" id="bellBtn" title="Notifications" aria-label="Notifications">' +
      icon('bell', 20) + '<span class="belldot" id="bellDot" hidden></span></button></div>' +
      '</div>' +
      '<div class="sb-label">Menu</div>' +
      '<nav class="sb-nav">' + links.join('') + '</nav>' +
      '<div class="sb-label" id="sbClassLbl" hidden></div>' +
      '<nav class="sb-nav" id="sbClassNav"></nav>' +
      '<div class="sb-foot">' +
      '<button class="uchip" id="profileBtn" title="Edit profile">' +
      '<span class="avatar">' + esc(initials) + '</span>' +
      '<span class="utxt"><b>' + esc(user.name) + '</b>' +
      '<span class="rolechip">' + (isTeacher ? 'Teacher' : 'Student') + '</span></span></button>' +
      '<button class="btn ghost sm" id="navLogout">' + icon('logout', 15) + '<span class="lbl">Log out</span></button>' +
      '</div>' +
      '<div class="notifpanel" id="notifPanel" hidden></div>' +
      '</aside>';

    document.getElementById('navLogout').onclick = async function () {
      try { await POST('/api/auth/logout'); } catch (e) {}
      setToken(null);
      location.href = 'login.html';
    };

    var profileBtn = document.getElementById('profileBtn');
    if (profileBtn) profileBtn.onclick = function () {
      editProfile(navUser).then(function (u) {
        if (u) navbar(u, navActive); // re-render sidebar with the new name — no page refresh
      });
    };

    fillSidebarClasses(user);
    setupBell(user);
  };

  async function fillSidebarClasses(user) {
    var box = document.getElementById('sbClassNav');
    var lbl = document.getElementById('sbClassLbl');
    if (!box || !lbl) return;
    try {
      var d = await GET('/api/classes');
      var here = location.pathname.split('/').pop() + location.search;
      var items = (d.classes || []).map(function (c) {
        var href = 'class.html?id=' + c.id;
        return '<a class="sb-item' + (href === here ? ' on' : '') + '" href="' + href + '">' +
          icon('bookOpen', 18) + '<span>' + esc(c.name) + '</span></a>';
      });
      if (items.length) {
        lbl.textContent = user.role === 'teacher' ? 'My class' : 'My classes';
        lbl.hidden = false;
        box.innerHTML = items.join('');
      }
    } catch (e) { /* not signed in or offline — leave hidden */ }
  }

  function notifIcon(type) {
    return type === 'expired' ? 'clock' : type === 'tabswitch' ? 'alertTriangle' : type === 'published' ? 'send' : 'checkCircle';
  }
  function notifVerb(type) {
    return type === 'expired' ? '— time expired, auto-graded'
      : type === 'tabswitch' ? '— auto-submitted after tab switch'
      : type === 'published' ? 'published a new quiz' : 'completed the quiz';
  }

  function setupBell() {
    var btn = document.getElementById('bellBtn');
    var panel = document.getElementById('notifPanel');
    var dot = document.getElementById('bellDot');
    var open = false, latestSeen = null;

    btn.onclick = async function (e) {
      e.stopPropagation();
      open = !open;
      panel.hidden = !open;
      if (open) { await refresh(); markAllRead(); }
    };
    document.addEventListener('click', function (e) {
      if (open && !panel.contains(e.target) && !btn.contains(e.target)) {
        open = false;
        panel.hidden = true;
      }
    });

    function renderPanel(data) {
      if (!data.groups.length) {
        panel.innerHTML = '<div class="notif-head">' + icon('bell', 18) + ' Notifications</div>' +
          '<div class="notif-empty">' + icon('bellOff', 30) + '<div style="margin-top:8px">No notifications yet.</div></div>';
        return;
      }
      var html = '<div class="notif-head">' + icon('bell', 18) + ' Notifications' +
        '<span class="spacer"></span><div class="notif-actions">' +
        '<button class="btn ghost sm" id="clearNotifs" title="Clear all">' + icon('trash', 14) + '</button></div></div>' +
        '<div class="notif-body">';
      data.groups.forEach(function (g) {
        html += '<div class="notif-group-title">' + icon('fileText', 13) + ' ' + esc(g.quizTitle) +
          (g.unread ? ' <span class="chip">' + g.unread + ' new</span>' : '') + '</div>';
        g.items.slice(0, 12).forEach(function (n) {
          if (n.type === 'published') {
            html += '<div class="notif-item' + (n.read ? '' : ' unread') + '" data-goto="dashboard.html" data-nid="' + esc(n.id) + '">' +
              '<span class="nico">' + icon(notifIcon(n.type), 17) + '</span>' +
              '<div><div class="nmain"><b>' + esc(n.teacherName || 'Your teacher') + '</b> ' + notifVerb(n.type) + '</div>' +
              '<div class="nsub">Take it from your dashboard · ' + fmtAgo(n.createdAt) + '</div></div>' +
              '</div>';
          } else {
            html += '<div class="notif-item' + (n.read ? '' : ' unread') + '" data-goto="result.html?attempt=' + esc(n.attemptId) + '" data-nid="' + esc(n.id) + '">' +
              '<span class="nico">' + icon(notifIcon(n.type), 17) + '</span>' +
              '<div><div class="nmain"><b>' + esc(n.studentName) + '</b> ' + notifVerb(n.type) + '</div>' +
              '<div class="nsub">' + fmtPct(n.percent) + ' · ' + (n.passed ? 'Passed' : 'Failed') + ' · ' + fmtAgo(n.createdAt) + '</div></div>' +
              '</div>';
          }
        });
      });
      html += '</div>';
      panel.innerHTML = html;

      $$('#notifPanel .notif-item').forEach(function (item) {
        item.onclick = async function () {
          try { await POST('/api/notifications/read', { id: item.getAttribute('data-nid') }); } catch (e) {}
          location.href = item.getAttribute('data-goto') || 'dashboard.html';
        };
      });
      var clearBtn = document.getElementById('clearNotifs');
      if (clearBtn) clearBtn.onclick = async function (e) {
        e.stopPropagation();
        await DEL('/api/notifications');
        await refresh();
      };
    }

    function paintDot(unread) {
      if (unread > 0) { dot.hidden = false; dot.textContent = unread > 99 ? '99+' : unread; }
      else dot.hidden = true;
    }

    async function refresh() {
      try {
        var d = await GET('/api/notifications');
        paintDot(d.unread);
        if (open) renderPanel(d);
        var newest = d.groups[0] && d.groups[0].items[0];
        if (newest && latestSeen !== null && newest.id !== latestSeen) {
          if (newest.type === 'published') {
            toast('New quiz published: <b>' + esc(newest.quizTitle) + '</b> — take it from your dashboard', 'info');
          } else {
            toast('<b>' + esc(newest.studentName) + '</b> ' + notifVerb(newest.type) + ' — ' + esc(newest.quizTitle) + ' (' + fmtPct(newest.percent) + ')', 'info');
          }
        }
        if (newest) latestSeen = newest.id;
      } catch (e) { /* signed out or offline — ignore */ }
    }

    async function markAllRead() {
      try { await POST('/api/notifications/read', {}); } catch (e) {}
      paintDot(0);
    }

    refresh();
    if (window.__oqasBellTimer) clearInterval(window.__oqasBellTimer);
    window.__oqasBellTimer = setInterval(function () { if (!document.hidden) refresh(); }, 10000);
  }

  /* ---------------- profile editing modal --------------------------------- */
  window.editProfile = function (user) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML =
        '<div class="modal"><h3>Edit profile</h3>' +
        '<p class="muted small">Update your name, sign-in email or password.</p>' +
        '<div class="form-err" id="profErr" hidden></div>' +
        '<form id="profForm" novalidate>' +
        '<div class="field"><label for="pfName">Full name</label>' +
        '<input id="pfName" type="text" value="' + esc(user.name) + '"></div>' +
        '<div class="field"><label for="pfEmail">Email address</label>' +
        '<input id="pfEmail" type="email" value="' + esc(user.email) + '"></div>' +
        '<div class="field"><label for="pfCur">Current password</label>' +
        '<input id="pfCur" type="password" autocomplete="current-password" placeholder="Required to save any change"></div>' +
        '<div class="field"><label for="pfNew">New password <span class="muted">(optional)</span></label>' +
        '<input id="pfNew" type="password" autocomplete="new-password" placeholder="Leave blank to keep your current password">' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn" data-x>Cancel</button>' +
        '<button type="submit" class="btn primary" id="pfSave">Save changes</button>' +
        '</div></form></div>';
      document.body.appendChild(ov);
      var close = function (v) { ov.remove(); resolve(v); };
      ov.querySelector('[data-x]').onclick = function () { close(null); };
      ov.onclick = function (e) { if (e.target === ov) close(null); };
      ov.querySelector('#profForm').onsubmit = async function (e) {
        e.preventDefault();
        var btn = ov.querySelector('#pfSave');
        var err = ov.querySelector('#profErr');
        err.hidden = true;
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          var r = await PUT('/api/auth/profile', {
            name: ov.querySelector('#pfName').value,
            email: ov.querySelector('#pfEmail').value,
            currentPassword: ov.querySelector('#pfCur').value,
            newPassword: ov.querySelector('#pfNew').value
          });
          toast(r.passwordChanged ? 'Profile updated — use your new password next time you sign in' : 'Profile updated');
          close(r.user);
        } catch (e2) {
          err.innerHTML = icon('alertCircle', 16) + '<span>' + esc(e2.message) + '</span>';
          err.hidden = false;
          btn.disabled = false; btn.textContent = 'Save changes';
        }
      };
    });
  };

  /* ---------------- toast -------------------------------------------------- */
  window.toast = function (msg, type) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (type === 'bad' ? icon('alertCircle', 17) : type === 'info' ? icon('info', 17) : icon('checkCircle', 17)) + '<span>' + msg + '</span>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 350); }, 3200);
  };

  /* ---------------- confirm dialog ---------------------------------------- */
  window.confirmModal = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML =
        '<div class="modal"><h3>' + esc(opts.title || 'Are you sure?') + '</h3>' +
        '<p class="muted">' + (opts.body || '') + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn" data-x>Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-ok>' + esc(opts.okText || 'Confirm') + '</button>' +
        '</div></div>';
      document.body.appendChild(ov);
      var close = function (v) { ov.remove(); resolve(v); };
      ov.querySelector('[data-x]').onclick = function () { close(false); };
      ov.querySelector('[data-ok]').onclick = function () { close(true); };
      ov.onclick = function (e) { if (e.target === ov) close(false); };
    });
  };
})();
