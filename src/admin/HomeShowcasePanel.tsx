import React, { useCallback, useEffect, useMemo, useState } from "react";
import adminApi from "./adminApi";
import { Button, Field, Banner, Spinner, Card, Eyebrow, Badge } from "./ui";
import { VIEW_GROUPS } from "../dashboard/overlayViews";

// Which event the home page simulation shows (/admin-panel/home-showcase).
// Saving copies a display-only snapshot of the round (names, logos, player
// names and photos, colours, maps); the home page never reads live data.

interface RoundRow {
  _id: string;
  roundName: string;
  day?: string;
  tournamentId?: { _id: string; tournamentName: string } | null;
  createdBy?: { username?: string; email?: string } | null;
}
interface GroupRow { _id: string; groupName: string; teams: number }
interface Showcase {
  seed: { tournament?: { tournamentName?: string }; round?: { roundName?: string }; groupName?: string; teams?: unknown[]; maps?: string[] };
  defaultTheme: string;
  views: string[];
  source?: { tournamentId: string; roundId: string; groupId?: string };
  updatedAt: string;
}

const THEMES = ["Theme1", "Theme2", "Theme3", "Theme4", "Theme5", "Theme6", "Theme7", "Theme8"];
const errText = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const HomeShowcasePanel: React.FC = () => {
  const [current, setCurrent] = useState<Showcase | null | undefined>(undefined);
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [roundId, setRoundId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [theme, setTheme] = useState("Theme1");
  const [views, setViews] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "save" | "refresh" | "reset">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = (s: Showcase | null) => {
    setCurrent(s);
    if (!s) return;
    setRoundId(s.source?.roundId || "");
    setGroupId(s.source?.groupId || "");
    setTheme(s.defaultTheme || "Theme1");
    setViews(s.views || []);
  };

  useEffect(() => {
    let alive = true;
    Promise.all([adminApi.get("/admin-panel/home-showcase"), adminApi.get("/admin-panel/rounds/all")])
      .then(([s, r]) => {
        if (!alive) return;
        adopt(s.data.showcase);
        setRounds(r.data);
      })
      .catch((err) => alive && setError(errText(err, "Could not load the showcase")));
    return () => { alive = false; };
  }, []);

  const loadGroups = useCallback(async (id: string) => {
    setGroups(null);
    if (!id) return;
    try {
      const { data } = await adminApi.get("/admin-panel/home-showcase/groups", { params: { roundId: id } });
      setGroups(data);
    } catch (err) {
      setError(errText(err, "Could not load the round's groups"));
      setGroups([]);
    }
  }, []);
  useEffect(() => { void loadGroups(roundId); }, [roundId, loadGroups]);

  const round = rounds?.find((r) => r._id === roundId) || null;
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = rounds || [];
    const hit = f
      ? list.filter((r) => `${r.tournamentId?.tournamentName || ""} ${r.roundName} ${r.createdBy?.username || ""}`.toLowerCase().includes(f))
      : list;
    // Keep the picked round in the list even when the filter hides it.
    return round && !hit.includes(round) ? [round, ...hit] : hit;
  }, [rounds, filter, round]);

  if (current === undefined || !rounds) {
    return <Card className="p-6">{error ? <Banner>{error}</Banner> : <Spinner label="Loading showcase" />}</Card>;
  }

  const run = async (kind: "save" | "refresh" | "reset") => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "reset") {
        await adminApi.delete("/admin-panel/home-showcase");
        setCurrent(null);
        setNotice("The home page now shows the built-in sample.");
      } else if (kind === "refresh") {
        const { data } = await adminApi.post("/admin-panel/home-showcase/refresh");
        adopt(data.showcase);
        setNotice("Snapshot refreshed from the event's current teams.");
      } else {
        const { data } = await adminApi.put("/admin-panel/home-showcase", {
          tournamentId: round?.tournamentId?._id, roundId, groupId: groupId || undefined, defaultTheme: theme, views,
        });
        adopt(data.showcase);
        setNotice("Saved. Visitors see it within 5 minutes (browser cache).");
      }
    } catch (err) {
      setError(errText(err, "That did not work"));
    } finally {
      setBusy("");
    }
  };

  const toggleView = (key: string) => setViews((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Home page simulation</Eyebrow>
            <p className="mt-2 text-sm text-[#93959C] max-w-2xl">
              Pick the event whose teams, logos and colours the simulation on the home page shows. The match itself is still simulated.
            </p>
          </div>
          <Badge on={!!current}>{current ? "Event set" : "Built-in sample"}</Badge>
        </div>
        {current && (
          <div className="text-sm text-[#F4F2EE] border border-[#24262B] bg-[#0B0C0E] px-4 py-3">
            <span className="font-semibold">{current.seed.tournament?.tournamentName || "—"}</span>
            {" · "}{current.seed.round?.roundName || "—"}
            {current.seed.groupName ? ` · ${current.seed.groupName}` : ""}
            <span className="ap-mono text-[11px] text-[#55565C]">
              {" "}· {current.seed.teams?.length || 0} teams · {current.seed.maps?.length || 0} matches · {current.defaultTheme} · updated {new Date(current.updatedAt).toLocaleString()}
            </span>
          </div>
        )}
        <Banner tone="info">
          The chosen event's team names, logos and player names and photos become visible to everyone on the home page.
        </Banner>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Find a round" hint={`${rounds.length} rounds, newest first`}>
            <input className="ap-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Tournament, round or owner" />
          </Field>
          <Field label="Round">
            <select className="ap-input" value={roundId} onChange={(e) => { setRoundId(e.target.value); setGroupId(""); }}>
              <option value="">— pick a round —</option>
              {shown.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.tournamentId?.tournamentName || "?"} · {r.roundName}{r.day ? ` (${r.day})` : ""}{r.createdBy?.username ? ` — ${r.createdBy.username}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Group" hint="The teams of this group appear in the simulation">
            <select className="ap-input" value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!roundId || !groups}>
              <option value="">{groups?.length ? "First group" : roundId ? (groups ? "No groups" : "Loading…") : "—"}</option>
              {(groups || []).map((g) => <option key={g._id} value={g._id}>{g.groupName} ({g.teams} teams)</option>)}
            </select>
          </Field>
          <Field label="Theme it opens on">
            <select className="ap-input" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="ap-mono text-[10px] tracking-[0.15em] text-[#93959C] uppercase">Overlays visitors can pick</span>
            <button type="button" className="ap-mono text-[10px] text-[#55565C] hover:text-[#F4F2EE] uppercase" onClick={() => setViews([])}>
              {views.length ? "Allow all" : "All allowed"}
            </button>
          </div>
          <p className="ap-mono text-[10px] text-[#55565C] mt-1">None ticked = every overlay.</p>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {VIEW_GROUPS.map((g) => (
              <div key={g.id}>
                <div className="ap-mono text-[10px] tracking-[0.12em] text-[#55565C] uppercase mb-1.5">{g.label}</div>
                {g.views.map((v) => (
                  <label key={v.key} className="flex items-center gap-2 text-sm text-[#F4F2EE] py-0.5">
                    <input type="checkbox" checked={views.includes(v.key)} onChange={() => toggleView(v.key)} className="accent-[#E11D2E]" />
                    {v.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        {error && <Banner>{error}</Banner>}
        {notice && <Banner tone="ok">{notice}</Banner>}

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => run("save")} disabled={!!busy || !round?.tournamentId?._id}>
            {busy === "save" ? "Saving…" : "Save showcase"}
          </Button>
          <Button variant="ghost" onClick={() => run("refresh")} disabled={!!busy || !current}>
            {busy === "refresh" ? "Refreshing…" : "Refresh data"}
          </Button>
          <Button variant="danger" onClick={() => run("reset")} disabled={!!busy || !current}>
            {busy === "reset" ? "Resetting…" : "Reset to sample"}
          </Button>
          <a href="/#simulator" target="_blank" rel="noopener noreferrer" className="self-center ap-mono text-[11px] text-[#93959C] hover:text-[#F4F2EE] uppercase tracking-[0.12em]">
            Open home page ↗
          </a>
        </div>
      </Card>
    </div>
  );
};

export default HomeShowcasePanel;
