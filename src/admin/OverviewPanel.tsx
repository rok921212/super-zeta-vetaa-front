import React, { useEffect, useState } from "react";
import { roleLabel } from "./adminApi";
import { useAdminData, ActivityRound } from "./AdminDataContext";
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
