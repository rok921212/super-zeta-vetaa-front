import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import api from "./api";
import { removeCache, setCache } from "../dashboard/cache";
import SocketManager from "../dashboard/socketManager";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface UserData {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
  token?: string;
}

// ------------------------------------------------------------------
// Same design language as Home.tsx / Teams.tsx: control-room dark,
// one red tally accent, Space Grotesk / Inter / JetBrains Mono.
// No continuous/keyframe animation — corner brackets, glow, and the
// status dot are all static, matching the rest of the app.
// ------------------------------------------------------------------
const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDebugInfo("");

    if (!email || !password) {
      setError(t('login.validation.emailRequired'));
      setLoading(false);
      return;
    }

    try {
      // 🔑 Read whatever user was cached BEFORE this login, so we can
      // clear their data specifically (not just the generic keys).
      const prevUserRaw = localStorage.getItem("user");
      let prevUserId: string | null = null;
      try {
        prevUserId = prevUserRaw ? JSON.parse(prevUserRaw)._id : null;
      } catch {
        prevUserId = null;
      }

      // 🔑 Nuke any cached data from a previous user BEFORE the new login lands
      removeCache("auth_user");
      removeCache("tournaments"); // legacy/unscoped key, in case it still exists
      if (prevUserId) {
        removeCache(`tournaments_${prevUserId}`);
      }
      localStorage.removeItem("user");

      const response = await api.post("/users/login", { email, password });
      const responseData = response.data;

      if (responseData.user && responseData.user._id && responseData.token) {
        const { _id, username, email: userEmail, isAdmin } = responseData.user;

        localStorage.setItem("user", JSON.stringify({ _id, username, email: userEmail, isAdmin, token: responseData.token }));
        SocketManager.getInstance().updateAuthToken(responseData.token);

        // 🔑 Warm the auth_user cache immediately with the CORRECT user,
        // so Dashboard's checkAuth() has a valid cache from the start.
        setCache("auth_user", responseData.user);

        navigate("/dashboard");
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err: any) {
      console.error("Login error:", err);

      let errorMessage = "Login failed. Please try again.";

      if (err.response) {
        errorMessage = err.response.data?.message ||
          err.response.statusText ||
          `Error: ${err.response.status}`;
      } else if (err.request) {
        errorMessage = "No response from server. Please check your connection.";
      } else {
        errorMessage = err.message || "An unexpected error occurred.";
      }

      setError(errorMessage);

      if (process.env.NODE_ENV !== 'production') {
        setDebugInfo(JSON.stringify({
          error: err.message,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
        }, null, 2));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center relative overflow-hidden px-4 py-10">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .lg-orb { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
        .lg-sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .lg-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .lg-scan {
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 1px,
            transparent 3px
          );
        }
        .lg-input {
          width: 100%; padding: 13px 14px; background: #0B0C0E;
          border: 1px solid #24262B; color: #F4F2EE; font-family: 'Inter', sans-serif;
          font-size: 14px; outline: none;
        }
        .lg-input::placeholder { color: #55565C; }
        .lg-input:focus { border-color: #E11D2E; }
        .lg-corner { pointer-events: none; position: absolute; width: 20px; height: 20px; border-color: #E11D2E; }
        input:-webkit-autofill {
          -webkit-text-fill-color: #F4F2EE;
          -webkit-box-shadow: 0 0 0px 1000px #0B0C0E inset;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>

      {/* Static red radial wash — no animation, just atmosphere */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(225,29,46,0.10), transparent)' }} />
      <div className="absolute inset-0 pointer-events-none lg-scan opacity-40" />

      <div className="w-full max-w-5xl grid md:grid-cols-2 bg-[#131418] border border-[#24262B] relative z-10 shadow-2xl">

        {/* Red tally rule across the top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#E11D2E]" />

        {/* ============ LEFT — BRAND PANEL ============ */}
        <div className="hidden md:flex flex-col justify-between bg-[#0E0F12] p-12 relative border-r border-[#24262B] overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 30% 20%, rgba(225,29,46,0.14), transparent 60%)' }} />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 mb-10">
              <span className="w-1.5 h-1.5 bg-[#E11D2E]" />
              <span className="lg-mono text-[11px] tracking-[0.24em] text-[#93959C] uppercase">Control Access</span>
            </div>

            {/* Logo, framed like the broadcast monitor tiles elsewhere in the app */}
            <div className="relative inline-block mb-8">
              <div className="w-24 h-24 bg-[#0B0C0E] border border-[#24262B] flex items-center justify-center">
                <img src="./logo.avif" alt="ScoreSync logo" width={64} height={64} className="w-16 h-16 object-contain" />
              </div>
              <span className="lg-corner absolute -top-[1px] -left-[1px] border-t-2 border-l-2" />
              <span className="lg-corner absolute -top-[1px] -right-[1px] border-t-2 border-r-2" />
              <span className="lg-corner absolute -bottom-[1px] -left-[1px] border-b-2 border-l-2" />
              <span className="lg-corner absolute -bottom-[1px] -right-[1px] border-b-2 border-r-2" />
            </div>

            <h2 className="lg-orb text-3xl font-extrabold text-[#F4F2EE] uppercase tracking-tight mb-4">
              Score<span className="text-[#E11D2E]">Sync</span>
            </h2>

            <p className="lg-sans text-[#93959C] text-[15px] leading-relaxed max-w-xs">
              Real-time esports tournament control system with live analytics,
              automation and smart match tracking.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-2 pt-10 border-t border-[#24262B] mt-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
            <span className="lg-mono text-[10px] tracking-[0.18em] text-[#55565C] uppercase">System online — tournament engine active</span>
          </div>
        </div>

        {/* ============ RIGHT — LOGIN FORM ============ */}
        <div className="p-8 sm:p-12 flex flex-col justify-center relative">

          {/* Mobile-only brand mark, since the left panel is hidden below md */}
          <div className="flex md:hidden items-center gap-3 mb-8">
            <img src="./logo.avif" alt="ScoreSync logo" width={34} height={34} className="w-9 h-9 object-contain" />
            <span className="lg-orb text-lg font-bold text-[#F4F2EE] uppercase tracking-tight">ScoreSync</span>
          </div>

          <div className="mb-9">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 bg-[#E11D2E]" />
              <span className="lg-mono text-[11px] tracking-[0.24em] text-[#93959C] uppercase">Operator Sign-In</span>
            </div>
            <h1 className="lg-orb text-3xl font-extrabold text-[#F4F2EE] uppercase tracking-tight mb-2">
              Welcome back
            </h1>
            <p className="lg-sans text-[#93959C] text-sm">
              Login to continue to your dashboard
            </p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 bg-[#E11D2E]/10 border border-[#E11D2E]/40 text-[#F4A8AE] text-sm lg-sans flex items-start gap-2">
              <span className="lg-mono text-[10px] tracking-[0.1em] text-[#E11D2E] uppercase pt-0.5 shrink-0">Error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">

            {/* Email */}
            <div>
              <label className="lg-mono text-[10px] tracking-[0.15em] text-[#93959C] uppercase">Email</label>
              <input
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="lg-input mt-2"
              />
            </div>

            {/* Password */}
            <div>
              <label className="lg-mono text-[10px] tracking-[0.15em] text-[#93959C] uppercase">Password</label>
              <input
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                className="lg-input mt-2"
              />
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 lg-orb font-bold text-sm tracking-wide uppercase ${
                loading
                  ? "bg-[#24262B] text-[#55565C] cursor-not-allowed"
                  : "bg-[#E11D2E] text-white hover:bg-[#F4F2EE] hover:text-[#0B0C0E]"
              }`}
            >
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          {debugInfo && process.env.NODE_ENV !== 'production' && (
            <pre className="mt-6 p-3 bg-[#0B0C0E] border border-[#24262B] text-[#55565C] text-[10px] lg-mono overflow-x-auto max-h-40 overflow-y-auto">
              {debugInfo}
            </pre>
          )}

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-[#24262B] flex items-center justify-between">
            <span className="lg-mono text-[10px] tracking-[0.1em] text-[#55565C]">© 2026 SCORESYNC</span>
            <span className="lg-mono text-[10px] tracking-[0.1em] text-[#55565C]">ALL RIGHTS RESERVED</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;