import React, { useEffect, useState } from "react";
import { useAdminData, Round } from "./AdminDataContext";
import { Button, Field, Banner, Spinner, Card, Badge } from "./ui";

const RoundRow: React.FC<{ round: Round; tournamentId: string }> = ({ round, tournamentId }) => {
  const ctx = useAdminData();
  const [open, setOpen] = useState(false);
  const busy = ctx.isSaving(round._id);

  const edit = () => {
    // eslint-disable-next-line no-alert
    const roundName = window.prompt("Round name:", round.roundName);
    if (roundName == null) return;
    // eslint-disable-next-line no-alert
    const day = window.prompt("Day:", round.day || "");
    if (day == null) return;
    ctx.updateRound(tournamentId, round._id, { roundName, day }).catch(() => {});
  };

  const del = () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete round "${round.roundName}"?`)) return;
    ctx.deleteRound(tournamentId, round._id).catch(() => {});
  };

  return (
    <div className={`border-t border-[#1B1C21] py-2.5 ${busy ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <button className="text-left" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm text-[#F4F2EE]">{round.roundName}</span>{" "}
          {round.day && <span className="ap-mono text-[11px] text-[#55565C]">· {round.day}</span>}{" "}
          {round.apiEnable && <Badge on>API live</Badge>}
        </button>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            className="!px-2 !py-1 !text-[10px]"
            onClick={() => ctx.updateRound(tournamentId, round._id, { apiEnable: !round.apiEnable }).catch(() => {})}
            disabled={busy}
          >
            {round.apiEnable ? "Disable API" : "Enable API"}
          </Button>
          <Button variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={edit} disabled={busy}>
            Edit
          </Button>
          <Button variant="danger" className="!px-2 !py-1 !text-[10px]" onClick={del} disabled={busy}>
            Delete
          </Button>
        </div>
      </div>
      {open && (
        <pre className="mt-2 p-3 bg-[#0B0C0E] border border-[#24262B] text-[11px] ap-mono text-[#93959C] overflow-x-auto">
          {JSON.stringify(
            {
              _id: round._id,
              roundName: round.roundName,
              day: round.day,
              apiEnable: !!round.apiEnable,
              groups: Array.isArray(round.groups) ? round.groups.length : 0,
              publicRev: round.publicRev,
              createdAt: round.createdAt,
            },
            null,
            2
          )}
        </pre>
      )}
    </div>
  );
};

const TournamentCard: React.FC<{ t: { _id: string; tournamentName: string; day?: string } }> = ({ t }) => {
  const ctx = useAdminData();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ roundName: "", day: "", apiEnable: false });

  const rounds = ctx.roundsByTournament[t._id];
  const savingNew = ctx.isSaving(`round-new-${t._id}`);
  const { loadRounds } = ctx;

  useEffect(() => {
    if (open && rounds === undefined) loadRounds(t._id);
  }, [open, rounds, t._id, loadRounds]);

  const createRound = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ctx.createRound(t._id, form);
      setForm({ roundName: "", day: "", apiEnable: false });
      setAdding(false);
    } catch {
      /* ctx.error shown by the dashboard */
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="text-left">
          <span className="ap-display font-bold uppercase tracking-tight text-[#F4F2EE]">{t.tournamentName}</span>
          {t.day && <span className="ap-mono text-[11px] text-[#55565C]"> · {t.day}</span>}
        </button>
        <span className="ap-mono text-[10px] text-[#55565C]">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase">Rounds</span>
            <Button variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "New round"}
            </Button>
          </div>

          {adding && (
            <form onSubmit={createRound} className="grid sm:grid-cols-3 gap-3 py-3">
              <Field label="Round name">
                <input className="ap-input" value={form.roundName} onChange={(e) => setForm({ ...form, roundName: e.target.value })} required />
              </Field>
              <Field label="Day">
                <input className="ap-input" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2">
                <input type="checkbox" checked={form.apiEnable} onChange={(e) => setForm({ ...form, apiEnable: e.target.checked })} />
                <span className="ap-mono text-[10px] tracking-[0.12em] text-[#93959C] uppercase">API enable</span>
              </label>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={savingNew}>
                  {savingNew ? "Creating…" : "Create round"}
                </Button>
              </div>
            </form>
          )}

          {rounds === undefined ? (
            <div className="py-3">
              <Spinner label="Loading rounds" />
            </div>
          ) : rounds.length === 0 ? (
            <p className="ap-mono text-[11px] text-[#55565C] py-3">No rounds in this tournament.</p>
          ) : (
            rounds.map((r) => <RoundRow key={r._id} round={r} tournamentId={t._id} />)
          )}
        </div>
      )}
    </Card>
  );
};

const TournamentsPanel: React.FC = () => {
  const ctx = useAdminData();
  const tournaments = ctx.tournaments ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="ap-display text-lg font-bold uppercase tracking-tight">
          Tournaments {ctx.tournaments && <span className="text-[#55565C]">({tournaments.length})</span>}
        </h2>
        <Button variant="ghost" onClick={ctx.refreshAll} disabled={ctx.loading} className="!px-3 !py-1.5">
          Refresh
        </Button>
      </div>

      <Banner tone="info">
        Tournament &amp; round management is scoped to the tournaments owned by the signed-in admin account —
        the same data the dashboard shows. User management (other tab) is global.
      </Banner>

      {!ctx.tournaments ? (
        <Card className="p-6">
          <Spinner label="Loading tournaments" />
        </Card>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <TournamentCard key={t._id} t={t} />
          ))}
          {tournaments.length === 0 && (
            <Card className="p-6">
              <p className="ap-mono text-[12px] text-[#55565C]">No tournaments found for this account.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default TournamentsPanel;
