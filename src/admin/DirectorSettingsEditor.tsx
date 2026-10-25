import React, { useEffect, useState } from "react";
import adminApi from "./adminApi";
import { Banner, Button, Field } from "./ui";

// One account's Auto Switcher (desktop OB director) settings, managed by an
// admin (Render_hosted/test-back services/directorSettings.js). Saving
// manages them: every desktop of the account takes these fight-following
// values (slots, keys and input mode stay per PC) and is told at once.
// "Stop managing" hands the settings back to each PC. The recent decisions
// are what the account's desktops reported (kept in server memory only).

interface Config {
  sensitivity: number;
  playerDwellS: number;
  fightDwellS: number;
  idleDwellS: number;
  minKeyGapS: number;
  fightMargin: number;
  playerMargin: number;
  resolveAfterS: number;
  resultHoldS: number;
  cooldownS: number;
  knockHoldS: number;
  downHoldS: number;
  leadTicks: number;
  idlePolicy: "rotate" | "stay";
  vehicleSuppression: boolean;
}

interface Decision { time: string; kind: string; teamId: number | null; name: string; reason: string; ok: boolean }

interface AdminState {
  managed: boolean;
  allowAutoSwitch: boolean;
  config: Config | null;
  version: number;
  updatedAt: string | null;
  recommended: Config;
  decisions: Decision[];
  decisionsAt: string | null;
}

const errorOf = (e: any) => e?.response?.data?.message || e?.message || "Request failed";

/** Numeric settings: [label, hint, min, max, step]. The first group is shown by default; the rest under Advanced. */
type NumKey = Exclude<keyof Config, "idlePolicy" | "vehicleSuppression" | "sensitivity">;
const BASIC: Array<[NumKey, string, string, number, number, number]> = [
  ["playerDwellS", "Minimum time on a player (s)", "Inside a fight the camera stays at least this long", 1, 60, 0.5],
  ["knockHoldS", "Show a knock for (s)", "After the observed player knocks or kills", 0, 20, 0.5],
  ["resultHoldS", "Show a fight's result for (s)", "When a fight ends", 0, 30, 0.5],
];
const ADVANCED: Array<[NumKey, string, string, number, number, number]> = [
  ["fightDwellS", "Fight dwell (s)", "Before leaving a fight for a bigger one; not shorter than the player dwell", 1, 120, 0.5],
  ["idleDwellS", "Idle rotation (s)", "Between team rotations when nothing happens", 3, 300, 1],
  ["minKeyGapS", "Minimum gap between switches (s)", "Cooldown between any two switches", 0.5, 10, 0.5],
  ["fightMargin", "Bigger-fight margin", "How much bigger another fight must be (0.25 = 25 %)", 0, 5, 0.05],
  ["playerMargin", "More-active margin", "How much more active a teammate must be", 0, 10, 0.5],
  ["leadTicks", "Lead checks", "Checks in a row (250 ms each) before moving to a more active player", 1, 20, 1],
  ["resolveAfterS", "Quiet time before a fight wraps up (s)", "Fight-lock release", 2, 30, 0.5],
  ["cooldownS", "Cooldown after a fight (s)", "Before idle rotation resumes", 0, 60, 0.5],
  ["downHoldS", "Stay on a knocked player (s)", "Before going to the same fight's next player", 0, 10, 0.5],
];

const DirectorSettingsEditor: React.FC<{ userId: string; username: string }> = ({ userId, username }) => {
  const [state, setState] = useState<AdminState | null>(null);
  const [form, setForm] = useState<Config | null>(null);
  const [allow, setAllow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/admin-panel/users/${userId}/director-settings`;

  const load = React.useCallback(() => {
    adminApi
      .get<AdminState>(url)
      .then((r) => {
        setState(r.data);
        setForm(r.data.config || r.data.recommended);
        setAllow(r.data.allowAutoSwitch);
      })
      .catch((e) => setResult({ ok: false, text: errorOf(e) }));
  }, [url]);
  useEffect(load, [load]);

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const r = await adminApi.put<AdminState>(url, { config: form, allowAutoSwitch: allow });
      setState((s) => (s ? { ...s, ...r.data } : s));
      setResult({ ok: true, text: `Saved. ${username}'s desktops use these settings now${allow ? "" : ", and automatic switching is off"}.` });
    } catch (err) {
      setResult({ ok: false, text: errorOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const stopManaging = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Give ${username}'s Auto Switcher settings back to each of their PCs?`)) return;
    setBusy(true);
    try {
      const r = await adminApi.post<AdminState>(`${url}/reset`);
      setState((s) => (s ? { ...s, ...r.data } : s));
      setAllow(true);
      setResult({ ok: true, text: "Not managed any more: each PC uses its own settings." });
    } catch (err) {
      setResult({ ok: false, text: errorOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const num = ([k, label, hint, min, max, step]: [NumKey, string, string, number, number, number]) => (
    <Field key={k} label={label} hint={hint}>
      <input
        type="number"
        className="ap-input"
        min={min}
        max={max}
        step={step}
        value={form ? form[k] : ""}
        onChange={(e) => set(k, Number(e.target.value) as Config[NumKey])}
      />
    </Field>
  );

  return (
    <div className="space-y-3 py-2 border-t border-[#24262B]" data-testid="director-settings">
      <div className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">
        Auto Switcher settings ·{" "}
        {!state ? "loading…" : `${state.managed ? `managed by admin · v${state.version}` : "each PC's own"} · switching ${state.allowAutoSwitch ? "allowed" : "off"}`}
      </div>
      {result && <Banner tone={result.ok ? "ok" : "error"}>{result.text}</Banner>}
      {form && (
        <>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <label className="flex items-center gap-2 text-sm text-[#E6E6E8]">
              <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
              Allow automatic switching
            </label>
            <Field label="Fight sensitivity" hint="1 = only clear fights · 5 = react to the first shots">
              <select className="ap-input" value={form.sensitivity} onChange={(e) => set("sensitivity", Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 3 ? " · recommended" : ""}</option>)}
              </select>
            </Field>
            <Field label="When nothing is happening">
              <select className="ap-input" value={form.idlePolicy} onChange={(e) => set("idlePolicy", e.target.value as Config["idlePolicy"])}>
                <option value="rotate">Rotate through teams</option>
                <option value="stay">Stay on the current player</option>
              </select>
            </Field>
            {BASIC.map(num)}
            <label className="flex items-center gap-2 text-sm text-[#E6E6E8]" title="Players riding in vehicles rank below players on foot unless they are fighting">
              <input type="checkbox" checked={form.vehicleSuppression} onChange={(e) => set("vehicleSuppression", e.target.checked)} />
              Rank players in vehicles lower
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-[#93959C]">Advanced (exact timings and margins)</summary>
            <div className="grid sm:grid-cols-3 gap-3 items-end pt-3">{ADVANCED.map(num)}</div>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : state?.managed ? "Save" : "Manage with these settings"}</Button>
            <Button type="button" variant="ghost" onClick={() => state && setForm(state.recommended)} disabled={busy}>Restore recommended</Button>
            <Button type="button" variant="ghost" onClick={stopManaging} disabled={busy || !state?.managed}>Stop managing</Button>
            <Button type="button" variant="ghost" onClick={load} disabled={busy}>Refresh</Button>
          </div>
        </>
      )}
      <div>
        <div className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase mb-1">
          Recent switch decisions {state?.decisionsAt ? `· reported ${new Date(state.decisionsAt).toLocaleTimeString()}` : ""}
        </div>
        {state && state.decisions.length === 0 ? (
          <div className="text-xs text-[#55565C]">None reported yet (the desktop reports while its director runs).</div>
        ) : (
          <div className="max-h-48 overflow-auto text-xs font-mono text-[#C9CACE]">
            {(state?.decisions || []).slice().reverse().map((d, i) => (
              <div key={i} className={d.ok ? "" : "text-[#F87171]"}>
                {d.time} {d.ok ? "→" : "✗"} team {d.teamId ?? "?"} {d.name} — {d.reason} [{d.kind}]
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectorSettingsEditor;
