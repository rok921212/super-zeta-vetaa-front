import React, { useEffect, useState } from "react";
import adminApi from "./adminApi";
import { Banner, Button, Field } from "./ui";

// One account's lock password: one lock for the desktop app's OB director
// (Auto Switcher) and the website Designer; the two toggles pick which of
// them it covers. The server keeps only a bcrypt hash; setting a password
// locks the account and every one of its desktops re-checks. "Use default"
// goes back to the deployment-wide password (DIRECTOR_LOCK_DEFAULT_HASH) and unlocks.

interface LockState {
  locked: boolean;
  designerLocked?: boolean;
  accountLocked?: boolean;
  scope?: { director: boolean; designer: boolean };
  available: boolean;
  hasCustomCredential: boolean;
  version: number;
}

const errorOf = (e: any) => e?.response?.data?.message || e?.message || "Request failed";

const DirectorLockEditor: React.FC<{ userId: string; username: string }> = ({ userId, username }) => {
  const [state, setState] = useState<LockState | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/admin-panel/users/${userId}/director-lock`;

  useEffect(() => {
    adminApi.get<LockState>(url).then((r) => setState(r.data)).catch((e) => setResult({ ok: false, text: errorOf(e) }));
  }, [url]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setResult({ ok: false, text: "Use at least 8 characters." });
    if (password !== confirm) return setResult({ ok: false, text: "The two passwords do not match." });
    setBusy(true);
    try {
      const r = await adminApi.put<LockState>(url, { password, confirm });
      setState(r.data);
      setResult({ ok: true, text: `Saved. ${username}'s account is now locked with the new password.` });
      setPassword("");
      setConfirm("");
    } catch (err) {
      setResult({ ok: false, text: errorOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Put ${username} back on the default account lock password and unlock it?`)) return;
    setBusy(true);
    try {
      const r = await adminApi.post<LockState>(`${url}/reset`);
      setState(r.data);
      setResult({ ok: true, text: "Back on the default password, unlocked." });
    } catch (err) {
      setResult({ ok: false, text: errorOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const setScope = async (area: "director" | "designer", on: boolean) => {
    setBusy(true);
    try {
      const r = await adminApi.put<LockState>(`${url}/scope`, { [area]: on });
      setState(r.data);
      setResult({ ok: true, text: `The lock ${on ? "now covers" : "no longer covers"} the ${area === "director" ? "Auto Switcher" : "Designer"}.` });
    } catch (err) {
      setResult({ ok: false, text: errorOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const scope = state?.scope ?? { director: true, designer: true };
  const accountLocked = state ? (state.accountLocked ?? state.locked) : false;

  return (
    <div className="space-y-3 py-2">
      <div className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">
        Account lock (Auto Switcher + Designer) ·{" "}
        {!state
          ? "loading…"
          : `${accountLocked ? "locked" : "unlocked"} · ${state.hasCustomCredential ? "own password" : state.available ? "default password" : "no password set up"} · v${state.version}`}
      </div>
      <div className="flex flex-wrap gap-4">
        {(["director", "designer"] as const).map((area) => (
          <label key={area} className="flex items-center gap-2">
            <input type="checkbox" checked={scope[area]} disabled={busy || !state} onChange={(e) => setScope(area, e.target.checked)} />
            <span className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">
              Lock {area === "director" ? "Auto Switcher" : "Designer"}
              {state && accountLocked && scope[area] ? " · locked now" : ""}
            </span>
          </label>
        ))}
      </div>
      {result && <Banner tone={result.ok ? "ok" : "error"}>{result.text}</Banner>}
      <form onSubmit={save} className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
        <Field label="New account lock password" hint="Min 8 characters. Stored as a hash only.">
          <input type="password" autoComplete="new-password" className="ap-input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password">
          <input type="password" autoComplete="new-password" className="ap-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || !password}>{busy ? "Saving…" : "Set password"}</Button>
        <Button type="button" variant="ghost" onClick={reset} disabled={busy || !state?.hasCustomCredential}>Use default</Button>
      </form>
    </div>
  );
};

export default DirectorLockEditor;
