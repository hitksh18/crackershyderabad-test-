/**
 * Vercel serverless entry point.
 *
 * Vercel mounts the Express app exported from ./server; routes defined there
 * are reachable under /api/* via the rewrites in vercel.json. app.listen is
 * skipped on Vercel (guarded in server.js).
 */
module.exports = require('./server');