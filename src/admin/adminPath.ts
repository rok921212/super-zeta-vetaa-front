// The custom URL that reveals the admin panel. This is obscurity, NOT
// authentication — it ends up in the JS bundle, browser history, referrer
// headers and proxy logs. Real protection is the existing admin login (JWT +
// User.isAdmin), enforced on every /api/admin-panel/* route server-side.
//
// Override at build time with REACT_APP_ADMIN_PATH (no leading/trailing slash).
// Multi-segment is fine, e.g. "9804344434/D9804344434@emon".
export const ADMIN_PATH = (process.env.REACT_APP_ADMIN_PATH || "9804344434/D9804344434@emon")
  .replace(/^\/+|\/+$/g, "");
