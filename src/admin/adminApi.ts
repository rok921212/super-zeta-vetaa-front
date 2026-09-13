import axios from "axios";

// Dedicated axios instance for the hidden admin panel. Kept separate from
// src/login/api.tsx so it never routes through the local overlay relay and a
// 401 does NOT hard-redirect to /login (AdminGate handles auth itself).
//
// No cookies are involved — the panel authenticates purely with the existing
// app Bearer token, which every /api/admin-panel/* route requires.

const API_BASE =
  (process.env.REACT_APP_API_URL || "https://super-zeta-beta-back-h89c.onrender.com").replace(/\/+$/, "") +
  "/api";

const adminApi = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

adminApi.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const { token } = JSON.parse(raw);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* malformed entry — send unauthenticated, the route will 401/403 */
  }
  return config;
});

export interface AdminUser {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isSubAdmin?: boolean;
  maxMatches?: number; // 0 = unlimited
  lastLoginAt?: string | null;
  loginCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type Role = "admin" | "sub-admin" | "user";

export const roleOf = (u: Pick<AdminUser, "isAdmin" | "isSubAdmin">): Role =>
  u.isAdmin ? "admin" : u.isSubAdmin ? "sub-admin" : "user";

export const roleLabel: Record<Role, string> = {
  admin: "Admin",
  "sub-admin": "Sub-Admin",
  user: "User",
};

export default adminApi;
