/* Vercel serverless entrypoint — every /api/* request lands here via the rewrite
   in vercel.json. Static pages are served straight from public/ by the Vercel CDN;
   the database is Supabase (see server.js: SERVERLESS mode). */
const app = require('../server.js');
module.exports = function (req, res) {
  // Normally Vercel hands us the original URL (/api/auth/login). Some routing paths
  // hand over the rewritten destination instead (/api/index?path=auth/login) —
  // rebuild the original from the path param so routing works either way.
  if (/^\/api\/index(?:\/|$|\?)/.test(req.url || '')) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const sub = u.searchParams.get('path');
      if (sub) {
        u.searchParams.delete('path');
        const qs = u.searchParams.toString();
        req.url = '/api/' + sub.replace(/^\/+/, '') + (qs ? '?' + qs : '');
      }
    } catch (e) { /* leave req.url as-is */ }
  }
  return app(req, res);
};
