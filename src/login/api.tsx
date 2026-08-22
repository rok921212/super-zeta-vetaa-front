import axios from "axios";

const api = axios.create({
  baseURL: "https://super-zeta-beta-back-xe87.onrender.com/api",
  headers: {
    'Content-Type': 'application/json',
  }
});

// Attaches Authorization: Bearer <token> from the "user" localStorage entry
// login/page.tsx writes on successful login — replaces the old
// withCredentials/session-cookie auth (removed: cookies never worked
// reliably cross-site for the desktop app's Tauri webview anyway).
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem("user");
  if (raw) {
    try {
      const { token } = JSON.parse(raw);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // malformed localStorage entry — send unauthenticated, requireAuth
      // will 401 and the response interceptor below sends them to /login
    }
  }
  return config;
});

// A 401 only ever comes from requireAuth/an inline session check on a
// protected route — loginUser itself returns 400 for bad credentials, so
// this can't misfire on a failed login attempt.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
