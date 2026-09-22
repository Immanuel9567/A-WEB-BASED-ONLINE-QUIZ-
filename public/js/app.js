/* ============================================================================
   OQAS — shared client helpers (auth storage, API wrapper, UI components)
   ============================================================================ */
(function () {
  'use strict';

  /* Token storage: localStorage with a safe in-memory fallback
     (works even inside sandboxed iframes). */
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

  window.getToken = function () { return Store.getItem('oqas_token'); };
  window.setToken = function (t) { t ? Store.setItem('oqas_token', t) : Store.removeItem('oqas_token'); };

  /* ---- API wrapper ------------------------------------------------------ */
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

  /* ---- misc helpers ------------------------------------------------------ */
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

  /* ---- auth guard -------------------------------------------------------- */
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

  /* ---- navbar ------------------------------------------------------------ */
  var LOGO = '<svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="url(#g1)"/><path d="M30 55l14 14 26-30" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs></svg>';

  window.navbar = function (user, active) {
    var el = document.getElementById('nav');
    if (!el) return;
    var isTeacher = user.role === 'teacher';
    var home = isTeacher ? 'teacher.html' : 'dashboard.html';
    var initials = user.name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    el.innerHTML =
      '<header class="topnav"><div class="container navrow">' +
      '<a class="brand" href="' + home + '">' + LOGO + '<span>OQAS</span></a>' +
      '<nav class="navlinks">' +
      '<a class="' + (active === 'dashboard' ? 'on' : '') + '" href="' + home + '">Dashboard</a>' +
      '<a href="index.html#features">About the system</a>' +
      '</nav>' +
      '<div class="navuser"><span class="uchip"><span class="avatar">' + esc(initials) + '</span>' +
      '<span class="uname">' + esc(user.name) + '</span>' +
      '<span class="rolechip ' + (isTeacher ? 't' : 's') + '">' + (isTeacher ? 'Teacher' : 'Student') + '</span></span>' +
      '<button class="btn ghost sm" id="navLogout">Log out</button></div>' +
      '</div></header>';
    document.getElementById('navLogout').onclick = async function () {
      try { await POST('/api/auth/logout'); } catch (e) {}
      setToken(null);
      location.href = 'login.html';
    };
  };

  /* ---- toast -------------------------------------------------------------- */
  window.toast = function (msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'ok');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 350); }, 2800);
  };

  /* ---- confirm dialog (promise-based) ------------------------------------ */
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
