import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import adminApi, { AdminUser } from "./adminApi";
import { ADMIN_PATH } from "./adminPath";
import { Screen, Eyebrow, Button, Field, Banner, Spinner, Card } from "./ui";
import NotFound from "./NotFound";
import AdminDashboard from "./AdminDashboard";

// ---------------------------------------------------------------------------
// Hidden admin panel entry point.
//
// Mounted from App.js as the lowest-priority "*" route, so it only ever sees
// a path no real route claimed. It renders the panel ONLY when the pathname
// exactly matches ADMIN_PATH; anything else is a generic 404.
//
// The matched URL is a convenience, not a security boundary. All enforcement
// is server-side: every /api/admin-panel/* route requires a valid app Bearer
// JWT for a user whose User.isAdmin === true.
// ---------------------------------------------------------------------------

type Phase = "checking" | "login" | "ready";

function useNoIndex() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Sign in";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      document.head.removeChild(meta);
    };
  }, []);
}

const statusOf = (e: any): number | undefined => e?.response?.status;
const hasToken = (): boolean => {
  try {
    return !!JSON.parse(localStorage.getItem("user") || "{}")?.token;
  } catch {
    return false;
  }
};

const AdminGate: React.FC = () => {
  const { pathname } = useLocation();
  const current = pathname.replace(/^\/+|\/+$/g, "");
  // Tolerate a browser percent-encoding chars like "@" in the address bar.
  const decoded = (() => {
    try {
      return decodeURIComponent(current);
    } catch {
      return current;
    }
  })();
  const pathMatches = current === ADMIN_PATH || decoded === ADMIN_PATH;

  useNoIndex();

  const [phase, setPhase] = useState<Phase>("checking");
  const [me, setMe] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const ran = useRef(false);

  const resolveMe = useCallback(async () => {
    try {
      const { data } = await adminApi.get("/admin-panel/me");
      setMe(data.user);
      setPhase("ready");
      setErr("");
      return true;
    } catch (e) {
      if (statusOf(e) === 403) setErr("This account is not an administrator.");
      setPhase("login");
      return false;
    }
  }, []);

  // Mount: if the path matches and we already hold a token, try to resume.
  useEffect(() => {
    if (!pathMatches || ran.current) return;
    ran.current = true;
    if (hasToken()) {
      resolveMe();
    } else {
      setPhase("login");
    }
  }, [pathMatches, resolveMe]);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { data } = await adminApi.post("/users/login", { email, password: loginPass });
      if (!data?.user?._id || !data?.token) throw new Error("bad response");
      const { _id, username, email: userEmail, isAdmin } = data.user;
      localStorage.setItem(
        "user",
        JSON.stringify({ _id, username, email: userEmail, isAdmin, token: data.token })
      );
      setLoginPass("");
      await resolveMe();
    } catch (e2) {
      const s = statusOf(e2);
      if (s === 429) setErr("Too many attempts. Try again later.");
      else setErr("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("user");
    setMe(null);
    setErr("");
    setEmail("");
    setLoginPass("");
    setPhase("login");
  };

  // Wrong URL — indistinguishable from any other dead link.
  if (!pathMatches) return <NotFound />;

  if (phase === "checking") {
    return (
      <Screen>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner label="Loading" />
        </div>
      </Screen>
    );
  }

  if (phase === "ready" && me) {
    return <AdminDashboard user={me} onSignOut={signOut} />;
  }

  // ---- Admin login ----
  return (
    <Screen>
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(225,29,46,0.10), transparent)" }}
        />
        <Card className="w-full max-w-md p-8 relative z-10">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#E11D2E]" />

          <div className="mb-7">
            <Eyebrow>Administrator Sign-In</Eyebrow>
            <h1 className="ap-display text-2xl font-extrabold uppercase tracking-tight mt-3">Sign in to continue</h1>
            <p className="ap-sans text-[#93959C] text-sm mt-2">
              Authenticate with your administrator account.
            </p>
          </div>

          {err && (
            <div className="mb-5">
              <Banner tone="error">{err}</Banner>
            </div>
          )}

          <form onSubmit={submitLogin} className="space-y-4">
            <Field label="Email">
              <input
                type="email"
                className="ap-input"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                className="ap-input"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                disabled={busy}
                required
              />
            </Field>
            <Button type="submit" disabled={busy || !email || !loginPass} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase mt-8 pt-5 border-t border-[#24262B]">
            Restricted · authorized personnel only
          </p>
        </Card>
      </div>
    </Screen>
  );
};

export default AdminGate;
