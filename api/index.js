const app = require('../server.js');
module.exports = function (req, res) {

  if (/^\/api\/index(?:\/|$|\?)/.test(req.url || '')) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const sub = u.searchParams.get('path');
      if (sub) {
        u.searchParams.delete('path');
        const qs = u.searchParams.toString();
        req.url = '/api/' + sub.replace(/^\/+/, '') + (qs ? '?' + qs : '');
      }
    } catch (e) {  }
  }
  return app(req, res);
};
