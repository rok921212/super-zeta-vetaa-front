import React, { useEffect, useState } from "react";
import { roleLabel } from "./adminApi";
import { useAdminData, ActivityRound, StorageCluster } from "./AdminDataContext";
import { Banner, Spinner, Card, Badge, Th, Td, Button } from "./ui";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "Never";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const StatCard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <Card className="p-4">
    <div className="ap-display text-2xl font-extrabold">{value}</div>
    <div className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase mt-1">{label}</div>
  </Card>
);

const fmtBytes = (n: number) => {
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
};

const StorageRow: React.FC<{ c: StorageCluster }> = ({ c }) => {
  if (!c.connected) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[#F4F2EE]">{c.label}</span>
        <span className="ap-mono text-[11px] text-[#55565C]">{c.error || "Not connected"}</span>
      </div>
    );
  }
  const used = c.usedBytes ?? 0;
  const pct = c.percentUsed ?? 0;
  const bar = pct >= 95 ? "bg-[#E11D2E]" : pct >= 80 ? "bg-[#E1A21D]" : "bg-[#1DE16A]";
  const collections = c.collections ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-sm text-[#F4F2EE]">{c.label}</span>
        <span className="ap-mono text-[12px] text-[#93959C]">
          {fmtBytes(used)} of {fmtBytes(c.quotaBytes)} used ·{" "}
          <span className="text-[#F4F2EE]">{fmtBytes(c.freeBytes ?? 0)} left</span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 bg-[#24262B]"
        role="progressbar"
        aria-label={`${c.label} storage used`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1.5 ap-mono text-[10px] text-[#55565C]">
        {pct}% · data {fmtBytes(c.dataBytes ?? 0)} · indexes {fmtBytes(c.indexBytes ?? 0)} ·{" "}
        <span className={collections >= c.collectionCap * 0.95 ? "text-[#F4A8AE]" : undefined}>
          collections {collections} / {c.collectionCap}
        </span>
        {c.partial && " · partial: this database only (DB user cannot list databases), real usage may be higher"}
      </div>
    </div>
  );
};

const StoragePanel: React.FC = () => {
  const { storage, storageError } = useAdminData();
  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase">Database storage</div>
        {storage && (
          <div className="ap-mono text-[10px] text-[#55565C]">as of {fmtDate(storage.generatedAt)}</div>
        )}
      </div>
      {storageError && <p className="ap-mono text-[11px] text-[#F4A8AE]">{storageError}</p>}
      {!storage && !storageError && <Spinner label="Loading storage" />}
      {storage?.clusters.map((c) => <StorageRow key={c.key} c={c} />)}
    </Card>
  );
};

const RoundLine: React.FC<{ r: ActivityRound }> = ({ r }) => (
  <div className="flex items-center gap-2 py-1 text-sm">
    <span className="text-[#93959C]">{r.roundName}</span>
    {r.day && <span className="ap-mono text-[10px] text-[#55565C]">· {r.day}</span>}
    {r.apiEnable && <Badge on>API</Badge>}
    <span className="ap-mono text-[11px] text-[#55565C] ml-auto">
      {r.matchCount} match{r.matchCount === 1 ? "" : "es"}
    </span>
  </div>
);

const UserActivity: React.FC<{ userId: string }> = ({ userId }) => {
  const { activityByUser, loadActivity } = useAdminData();
  const [busy, setBusy] = useState(false);
  const data = activityByUser[userId];

  useEffect(() => {
    if (data) return;
    setBusy(true);
    loadActivity(userId).finally(() => setBusy(false));
  }, [userId, data, loadActivity]);

  if (busy && !data) return <div className="p-4"><Spinner label="Loading activity" /></div>;
  if (!data) return null;

  return (
    <div className="p-4 bg-[#0E0F12] space-y-3">
      {data.tournaments.length === 0 && data.orphanRounds.length === 0 && (
        <p className="ap-mono text-[11px] text-[#55565C]">No tournaments, rounds or matches for this user.</p>
      )}
      {data.tournaments.map((t) => (
        <div key={t._id} className="border-l-2 border-[#24262B] pl-3">
          <div className="ap-display font-bold uppercase tracking-tight text-sm">
            {t.tournamentName}
            {t.day && <span className="ap-mono text-[10px] text-[#55565C] normal-case"> · {t.day}</span>}
            <span className="ap-mono text-[10px] text-[#55565C] normal-case">
              {" "}· {t.rounds.length} round{t.rounds.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1">
            {t.rounds.length === 0 ? (
              <p className="ap-mono text-[10px] text-[#55565C]">No rounds.</p>
            ) : (
              t.rounds.map((r) => <RoundLine key={r._id} r={r} />)
            )}
          </div>
        </div>
      ))}
      {data.orphanRounds.length > 0 && (
        <div className="border-l-2 border-[#24262B] pl-3">
          <div className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase">
            Rounds without an owned tournament
          </div>
          {data.orphanRounds.map((r) => <RoundLine key={r._id} r={r} />)}
        </div>
      )}
    </div>
  );
};

const OverviewPanel: React.FC = () => {
  const { overview, refreshAll, loading } = useAdminData();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="ap-display text-lg font-bold uppercase tracking-tight">Overview</h2>
        <Button variant="ghost" onClick={refreshAll} disabled={loading} className="!px-3 !py-1.5">
          Refresh
        </Button>
      </div>

      <Banner tone="info">
        <strong className="text-[#F4F2EE]">Roles.</strong>{" "}
        <em>Admin</em> — full admin-panel access, unlimited matches.{" "}
        <em>Sub-Admin</em> — an ordinary dashboard user with a capped number of matches they may create;
        no panel access, data stays scoped to their own account.{" "}
        <em>User</em> — no cap, no panel access.
        <br />
        Revoking <em>Admin</em> only removes admin-panel access, the global user directory, and the
        cross-account team override — it does <strong className="text-[#F4F2EE]">not</strong> hide or break a
        user's own tournaments, rounds, matches or teams, and needs no re-login.
      </Banner>

      {!overview ? (
        <Card className="p-6"><Spinner label="Loading overview" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Users" value={overview.totals.users} />
            <StatCard label="Tournaments" value={overview.totals.tournaments} />
            <StatCard label="Rounds" value={overview.totals.rounds} />
            <StatCard label="Matches" value={overview.totals.matches} />
          </div>

          <StoragePanel />

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th>Last login</Th>
                    <Th>Logins</Th>
                    <Th>Tournaments</Th>
                    <Th>Rounds</Th>
                    <Th>Matches</Th>
                    <Th>Match limit</Th>
                    <Th>Active API round</Th>
                  </tr>
                </thead>
                <tbody>
                  {overview.users.map((u) => {
                    const open = openId === u._id;
                    return (
                      <React.Fragment key={u._id}>
                        <tr className="cursor-pointer hover:bg-[#17181D]" onClick={() => setOpenId(open ? null : u._id)}>
                          <Td>
                            <div className="text-[#F4F2EE]">{u.username}</div>
                            <div className="ap-mono text-[10px] text-[#55565C]">{u.email}</div>
                          </Td>
                          <Td><Badge on={u.role !== "user"}>{roleLabel[u.role]}</Badge></Td>
                          <Td className="ap-mono text-[11px] text-[#93959C]">{fmtDate(u.lastLoginAt)}</Td>
                          <Td className="ap-mono text-[11px] text-[#93959C]">{u.loginCount}</Td>
                          <Td>{u.counts.tournaments}</Td>
                          <Td>{u.counts.rounds}</Td>
                          <Td>{u.counts.matches}</Td>
                          <Td className="ap-mono text-[12px]">
                            {u.isAdmin || !u.maxMatches ? "∞" : `${u.counts.matches} / ${u.maxMatches}`}
                          </Td>
                          <Td className="text-[#93959C]">
                            {u.activeApiRound
                              ? `${u.activeApiRound.roundName}${
                                  u.activeApiRound.tournamentName ? ` (${u.activeApiRound.tournamentName})` : ""
                                }`
                              : "—"}
                          </Td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={9} className="border-b border-[#1B1C21] p-0">
                              <UserActivity userId={u._id} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {overview.users.length === 0 && (
                    <tr><Td>No users.</Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="ap-mono text-[10px] text-[#55565C]">
            Click a row to expand that user's tournament → round → match tree.
          </p>
        </>
      )}
    </div>
  );
};

export default OverviewPanel;
