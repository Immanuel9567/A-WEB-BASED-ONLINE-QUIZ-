/* Vercel serverless entrypoint — every /api/* request lands here.
   Static pages are served straight from public/ by the Vercel CDN;
   the database is Supabase (see server.js: SERVERLESS mode). */
const app = require('../server.js');
module.exports = app.vercelHandler;
