import React, { useState } from "react";
import { AVAILABLE_THEMES } from "../Themes/registry";
import { useAdminData, OverviewUser } from "./AdminDataContext";
import { Banner, Button } from "./ui";

// Which built-in themes (Theme1..ThemeN) one account may pick. "All themes"
// stores nothing (every theme, including ones added later); otherwise the
// ticked list is stored on the user (User.allowedThemes). The account's own
// custom themes (Theme9+) are never affected, and overlay links that already
// name a theme keep working: only the theme pickers and the Designer follow it.

const themeNo = (t: string) => Number(t.replace(/\D+/g, "")) || 0;
export const BUILTIN_THEMES = [...AVAILABLE_THEMES].sort((a, b) => themeNo(a) - themeNo(b));

export const themeAccessLabel = (u: OverviewUser) =>
  u.isAdmin || !Array.isArray(u.allowedThemes) ? "All" : `${u.allowedThemes.length}/${BUILTIN_THEMES.length}`;

const ThemeAccessEditor: React.FC<{ user: OverviewUser }> = ({ user }) => {
  const ctx = useAdminData();
  const initial = Array.isArray(user.allowedThemes) ? user.allowedThemes : null;
  const [all, setAll] = useState(initial === null);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial ?? BUILTIN_THEMES));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = ctx.isSaving(user._id);

  const toggle = (t: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const save = async () => {
    const list = BUILTIN_THEMES.filter((t) => picked.has(t));
    if (!all && list.length === 0) return setResult({ ok: false, text: "Tick at least one theme, or choose All themes." });
    try {
      await ctx.setUserAccess(user._id, { allowedThemes: all ? null : list });
      setResult({ ok: true, text: all ? `${user.username} can pick every theme.` : `${user.username} can pick ${list.join(", ")}.` });
    } catch {
      setResult({ ok: false, text: "Could not save the themes." });
    }
  };

  return (
    <div className="space-y-3 py-2 border-b border-[#24262B]">
      <div className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">
        Built-in themes · {user.isAdmin ? "admins always see every theme" : themeAccessLabel(user)}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={all} disabled={busy} onChange={(e) => setAll(e.target.checked)} />
        <span className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">All themes (including ones added later)</span>
      </label>
      <div className="flex flex-wrap gap-4">
        {BUILTIN_THEMES.map((t) => (
          <label key={t} className={`flex items-center gap-2 ${all ? "opacity-40" : ""}`}>
            <input type="checkbox" checked={all || picked.has(t)} disabled={busy || all} onChange={() => toggle(t)} />
            <span className="ap-mono text-[12px]">{t}</span>
          </label>
        ))}
      </div>
      {result && <Banner tone={result.ok ? "ok" : "error"}>{result.text}</Banner>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save themes"}</Button>
      </div>
      <div className="text-[11px] text-[#55565C]">
        Hides the other built-in themes in DisplayHud's theme picker and in the Designer. The account's own custom
        themes are not affected, and overlay links already in OBS keep working.
      </div>
    </div>
  );
};

export default ThemeAccessEditor;
