import React, { useCallback, useEffect, useState } from "react";
import adminApi from "./adminApi";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";
import { Button, Field, Banner, Spinner, Card, Eyebrow } from "./ui";

// The images a team / player gets when it is created without one
// (GET/PUT /admin-panel/team-defaults). An empty value = the built-in asset.
type DefaultKey = "defaultTeamLogo" | "defaultPlayerPhoto" | "defaultTeamFlag";
type Defaults = Record<DefaultKey, string>;

interface ApplyResult {
  teamsTouched: number;
  logos: number;
  flags: number;
  teamsWithPhotos: number;
}

// Same Cloudinary folders / presets the Teams page uploads with.
const ROWS: { key: DefaultKey; label: string; hint: string; folder: string; preset: string }[] = [
  { key: "defaultTeamLogo", label: "Team logo", hint: "Used when a team has no logo", folder: "teams/logos", preset: "team_logo" },
  { key: "defaultPlayerPhoto", label: "Player photo", hint: "Used when a player has no photo", folder: "players/photos", preset: "player_photo" },
  { key: "defaultTeamFlag", label: "Team flag", hint: "Used when a team has no flag", folder: "teams/flags", preset: "team_flag" },
];

const errText = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const DefaultsPanel: React.FC = () => {
  const [builtIn, setBuiltIn] = useState<Defaults | null>(null);
  const [saved, setSaved] = useState<Defaults | null>(null);
  const [draft, setDraft] = useState<Defaults | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "apply" | DefaultKey>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.get("/admin-panel/team-defaults");
      setBuiltIn(data.builtIn);
      setSaved(data.defaults);
      setDraft(data.defaults);
    } catch (err) {
      setError(errText(err, "Could not load the defaults"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!draft || !saved || !builtIn) {
    return <Card className="p-6">{error ? <Banner>{error}</Banner> : <Spinner label="Loading defaults" />}</Card>;
  }

  const dirty = ROWS.some((r) => draft[r.key].trim() !== saved[r.key]);
  const set = (key: DefaultKey, value: string) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setNotice(null);
  };

  const upload = async (row: (typeof ROWS)[number], file: File | undefined) => {
    if (!file) return;
    setBusy(row.key);
    setError(null);
    try {
      set(row.key, await uploadToCloudinary(file, row.folder, row.preset));
    } catch (err) {
      setError(errText(err, "Upload failed"));
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      // A value equal to the built-in is stored as '' so it keeps following the built-in.
      const body: Partial<Defaults> = {};
      ROWS.forEach((r) => {
        const v = draft[r.key].trim();
        if (v !== saved[r.key]) body[r.key] = v === builtIn[r.key] ? "" : v;
      });
      const { data } = await adminApi.put("/admin-panel/team-defaults", body);
      setSaved(data.defaults);
      setDraft(data.defaults);
      setNotice("Saved. New teams and players without an image now get these.");
    } catch (err) {
      setError(errText(err, "Could not save the defaults"));
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm("Replace the old default image on every existing team and player that still has it? Images someone chose are not touched.")) return;
    setBusy("apply");
    setError(null);
    setNotice(null);
    try {
      const { data } = await adminApi.post<ApplyResult>("/admin-panel/team-defaults/apply");
      setNotice(
        data.teamsTouched
          ? `Updated ${data.teamsTouched} team(s): ${data.logos} logo(s), ${data.flags} flag(s), player photos on ${data.teamsWithPhotos} team(s).`
          : "Nothing to update — no team or player is on an old default."
      );
    } catch (err) {
      setError(errText(err, "Could not apply the defaults"));
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className="p-6 space-y-5">
      <div>
        <Eyebrow>Default images</Eyebrow>
        <p className="mt-2 text-sm text-[#93959C]">
          What a team or player gets when it is created without its own image. Paste an https:// link or upload a file.
        </p>
      </div>

      {error && <Banner>{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      {ROWS.map((row) => {
        const value = draft[row.key];
        const isBuiltIn = value.trim() === builtIn[row.key];
        return (
          <div key={row.key} className="flex flex-col sm:flex-row sm:items-end gap-3">
            <img
              src={value || builtIn[row.key]}
              alt={row.label}
              className="w-16 h-16 object-contain bg-[#0B0C0E] border border-[#24262B] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <Field label={row.label} hint={isBuiltIn ? `${row.hint} · built-in` : row.hint}>
                <input
                  className="ap-input"
                  value={value}
                  placeholder={builtIn[row.key]}
                  onChange={(e) => set(row.key, e.target.value)}
                  disabled={!!busy}
                />
              </Field>
            </div>
            <div className="flex gap-1.5 sm:pb-4">
              <label className={`px-4 py-2.5 ap-display font-bold text-xs tracking-wide uppercase border border-[#24262B] text-[#F4F2EE] hover:border-[#E11D2E] hover:text-[#E11D2E] ${busy ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}>
                {busy === row.key ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    upload(row, file);
                  }}
                />
              </label>
              <Button variant="ghost" onClick={() => set(row.key, builtIn[row.key])} disabled={!!busy || isBuiltIn}>
                Reset
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#24262B]">
        <Button onClick={save} disabled={!dirty || !!busy}>
          {busy === "save" ? "Saving…" : "Save defaults"}
        </Button>
        <Button variant="ghost" onClick={apply} disabled={dirty || !!busy}>
          {busy === "apply" ? "Applying…" : "Apply to existing teams"}
        </Button>
      </div>
      <p className="ap-mono text-[10px] text-[#55565C]">
        Saving only affects teams and players created from now on. "Apply to existing teams" also swaps the image on
        those still using an old default.
      </p>
    </Card>
  );
};

export default DefaultsPanel;
