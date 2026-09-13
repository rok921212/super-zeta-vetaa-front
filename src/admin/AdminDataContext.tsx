import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import adminApi, { roleOf, Role } from "./adminApi";

// ---------------------------------------------------------------------------
// Single load-once data store for the whole admin panel.
//
// Mounted once by AdminDashboard. The three sections (Overview / Users /
// Tournaments) stay mounted and read from here, so switching sections issues
// NO network calls. After the initial two GETs the only requests are the
// actual mutations plus first-time lazy detail loads (a user's activity tree,
// a tournament's rounds), each cached.
// ---------------------------------------------------------------------------

export const errText = (e: any, fb: string) =>
  e?.response?.data?.message || e?.response?.data?.error || fb;

export interface OverviewUser {
  _id: string;
  username: string;
  email: string;
  role: Role;
  isAdmin: boolean;
  isSubAdmin: boolean;
  maxMatches: number;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
  counts: { tournaments: number; rounds: number; matches: number };
  activeApiRound: { _id: string; roundName: string; tournamentName: string | null } | null;
}
export interface OverviewTotals {
  users: number;
  tournaments: number;
  rounds: number;
  matches: number;
}
export interface Overview {
  users: OverviewUser[];
  totals: OverviewTotals;
}

export interface Tournament {
  _id: string;
  tournamentName: string;
  day?: string;
}
export interface Round {
  _id: string;
  roundName: string;
  day?: string;
  apiEnable?: boolean;
  groups?: unknown[];
  publicRev?: number;
  createdAt?: string;
  tournamentId?: string;
}

export interface ActivityRound {
  _id: string;
  roundName: string;
  day?: string;
  apiEnable?: boolean;
  matchCount: number;
}
export interface ActivityTournament {
  _id: string;
  tournamentName: string;
  day?: string;
  rounds: ActivityRound[];
}
export interface Activity {
  counts: { tournaments: number; rounds: number; matches: number };
  tournaments: ActivityTournament[];
  orphanRounds: ActivityRound[];
}

interface AdminDataValue {
  loading: boolean;
  error: string;
  setError: (s: string) => void;
  overview: Overview | null;
  tournaments: Tournament[] | null;
  roundsByTournament: Record<string, Round[] | undefined>;
  activityByUser: Record<string, Activity | undefined>;
  isSaving: (id: string) => boolean;

  refreshAll: () => Promise<void>;

  createUser: (body: Record<string, unknown>) => Promise<void>;
  updateUser: (id: string, body: Record<string, unknown>) => Promise<void>;
  setUserAccess: (id: string, body: Record<string, unknown>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  loadActivity: (uid: string) => Promise<void>;

  loadRounds: (tid: string, force?: boolean) => Promise<void>;
  createRound: (tid: string, body: Record<string, unknown>) => Promise<void>;
  updateRound: (tid: string, rid: string, body: Record<string, unknown>) => Promise<void>;
  deleteRound: (tid: string, rid: string) => Promise<void>;
}

const Ctx = createContext<AdminDataValue | null>(null);

export const useAdminData = (): AdminDataValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminData must be used inside <AdminDataProvider>");
  return v;
};

// Merge a partial user doc from a mutation response onto an existing overview
// row, preserving the aggregate fields the mutation endpoints don't return.
function mergeUser(prev: OverviewUser, patch: any): OverviewUser {
  const next: OverviewUser = {
    ...prev,
    username: patch.username ?? prev.username,
    email: patch.email ?? prev.email,
    isAdmin: patch.isAdmin ?? prev.isAdmin,
    isSubAdmin: patch.isSubAdmin ?? prev.isSubAdmin,
    maxMatches: patch.maxMatches ?? prev.maxMatches,
    lastLoginAt: patch.lastLoginAt ?? prev.lastLoginAt,
    loginCount: patch.loginCount ?? prev.loginCount,
  };
  next.role = roleOf(next);
  return next;
}

export const AdminDataProvider: React.FC<{ selfId: string; children: React.ReactNode }> = ({
  selfId,
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [roundsByTournament, setRoundsByTournament] = useState<Record<string, Round[] | undefined>>({});
  const [activityByUser, setActivityByUser] = useState<Record<string, Activity | undefined>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Refs mirror state so loadRounds/loadActivity can stay referentially stable
  // (they sit in effect deps) and dedupe concurrent calls for the same key.
  const roundsRef = useRef(roundsByTournament);
  roundsRef.current = roundsByTournament;
  const activityRef = useRef(activityByUser);
  activityRef.current = activityByUser;
  const inflight = useRef<Set<string>>(new Set());

  const startSave = useCallback((id: string) => {
    setSavingIds((s) => new Set(s).add(id));
  }, []);
  const endSave = useCallback((id: string) => {
    setSavingIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);
  const isSaving = useCallback((id: string) => savingIds.has(id), [savingIds]);

  // ── primary load (once, or on explicit Refresh) ───────────────────────
  const loadPrimary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, ts] = await Promise.all([
        adminApi.get("/admin-panel/overview"),
        adminApi.get("/admin-panel/tournaments"),
      ]);
      setOverview(ov.data);
      setTournaments(Array.isArray(ts.data) ? ts.data : []);
    } catch (e) {
      setError(errText(e, "Failed to load admin data."));
    } finally {
      setLoading(false);
    }
  }, []);

  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    loadPrimary();
  }, [loadPrimary]);

  const refreshAll = useCallback(async () => {
    setRoundsByTournament({});
    setActivityByUser({});
    await loadPrimary();
  }, [loadPrimary]);

  // ── local patch helpers ──────────────────────────────────────────────
  const patchSelfCounts = useCallback(
    (delta: Partial<{ tournaments: number; rounds: number; matches: number }>) => {
      setOverview((ov) => {
        if (!ov) return ov;
        return {
          totals: {
            users: ov.totals.users,
            tournaments: ov.totals.tournaments + (delta.tournaments || 0),
            rounds: ov.totals.rounds + (delta.rounds || 0),
            matches: ov.totals.matches + (delta.matches || 0),
          },
          users: ov.users.map((u) =>
            u._id === selfId
              ? {
                  ...u,
                  counts: {
                    tournaments: u.counts.tournaments + (delta.tournaments || 0),
                    rounds: u.counts.rounds + (delta.rounds || 0),
                    matches: u.counts.matches + (delta.matches || 0),
                  },
                }
              : u
          ),
        };
      });
    },
    [selfId]
  );

  const setSelfActiveRound = useCallback(
    (round: { _id: string; roundName: string } | null, tournamentId?: string) => {
      setOverview((ov) => {
        if (!ov) return ov;
        const tName =
          round && tournamentId
            ? tournaments?.find((t) => t._id === tournamentId)?.tournamentName ?? null
            : null;
        return {
          ...ov,
          users: ov.users.map((u) =>
            u._id === selfId
              ? {
                  ...u,
                  activeApiRound: round ? { _id: round._id, roundName: round.roundName, tournamentName: tName } : null,
                }
              : u
          ),
        };
      });
    },
    [selfId, tournaments]
  );

  // When a round becomes apiEnable:true, the server disables every other
  // apiEnable round for this user (one per createdBy). Mirror that in every
  // cached tournament's rounds list.
  const clearOtherApiRounds = useCallback((keepRoundId: string) => {
    setRoundsByTournament((map) => {
      let changed = false;
      const next: Record<string, Round[] | undefined> = {};
      for (const [tid, list] of Object.entries(map)) {
        if (!list) {
          next[tid] = list;
          continue;
        }
        const patched = list.map((r) => {
          if (r.apiEnable && r._id !== keepRoundId) {
            changed = true;
            return { ...r, apiEnable: false };
          }
          return r;
        });
        next[tid] = patched;
      }
      return changed ? next : map;
    });
  }, []);

  // ── USER actions ─────────────────────────────────────────────────────
  const createUser = useCallback(
    async (body: Record<string, unknown>) => {
      startSave("new");
      setError("");
      try {
        const { data } = await adminApi.post("/admin-panel/users", body);
        const row: OverviewUser = {
          _id: data._id,
          username: data.username,
          email: data.email,
          role: roleOf(data),
          isAdmin: !!data.isAdmin,
          isSubAdmin: !!data.isSubAdmin,
          maxMatches: data.maxMatches || 0,
          lastLoginAt: data.lastLoginAt ?? null,
          loginCount: data.loginCount ?? 0,
          createdAt: data.createdAt,
          counts: { tournaments: 0, rounds: 0, matches: 0 },
          activeApiRound: null,
        };
        setOverview((ov) =>
          ov ? { totals: { ...ov.totals, users: ov.totals.users + 1 }, users: [...ov.users, row] } : ov
        );
      } catch (e) {
        setError(errText(e, "Failed to create user."));
        throw e;
      } finally {
        endSave("new");
      }
    },
    [startSave, endSave]
  );

  const updateUser = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      startSave(id);
      setError("");
      try {
        const { data } = await adminApi.put(`/admin-panel/users/${id}`, body);
        setOverview((ov) =>
          ov ? { ...ov, users: ov.users.map((u) => (u._id === id ? mergeUser(u, data) : u)) } : ov
        );
      } catch (e) {
        setError(errText(e, "Update failed."));
        throw e;
      } finally {
        endSave(id);
      }
    },
    [startSave, endSave]
  );

  const setUserAccess = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      startSave(id);
      setError("");
      try {
        const { data } = await adminApi.put(`/admin-panel/users/${id}/access`, body);
        setOverview((ov) =>
          ov ? { ...ov, users: ov.users.map((u) => (u._id === id ? mergeUser(u, data) : u)) } : ov
        );
      } catch (e) {
        setError(errText(e, "Update failed."));
        throw e;
      } finally {
        endSave(id);
      }
    },
    [startSave, endSave]
  );

  const deleteUser = useCallback(
    async (id: string) => {
      startSave(id);
      setError("");
      try {
        await adminApi.delete(`/admin-panel/users/${id}`);
        setOverview((ov) => {
          if (!ov) return ov;
          const gone = ov.users.find((u) => u._id === id);
          return {
            users: ov.users.filter((u) => u._id !== id),
            totals: {
              users: Math.max(0, ov.totals.users - 1),
              tournaments: ov.totals.tournaments - (gone?.counts.tournaments || 0),
              rounds: ov.totals.rounds - (gone?.counts.rounds || 0),
              matches: ov.totals.matches - (gone?.counts.matches || 0),
            },
          };
        });
        setActivityByUser((m) => {
          if (!(id in m)) return m;
          const n = { ...m };
          delete n[id];
          return n;
        });
      } catch (e) {
        setError(errText(e, "Delete failed."));
        throw e;
      } finally {
        endSave(id);
      }
    },
    [startSave, endSave]
  );

  const loadActivity = useCallback(async (uid: string) => {
    if (activityRef.current[uid]) return;
    const key = `act:${uid}`;
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    try {
      const { data } = await adminApi.get(`/admin-panel/users/${uid}/activity`);
      setActivityByUser((m) => ({ ...m, [uid]: data }));
    } catch (e) {
      setError(errText(e, "Failed to load activity."));
    } finally {
      inflight.current.delete(key);
    }
  }, []);

  // ── ROUND actions ────────────────────────────────────────────────────
  const loadRounds = useCallback(async (tid: string, force = false) => {
    if (!force && roundsRef.current[tid]) return;
    const key = `rounds:${tid}`;
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    try {
      const { data } = await adminApi.get(`/admin-panel/tournaments/${tid}/rounds`);
      setRoundsByTournament((m) => ({ ...m, [tid]: Array.isArray(data) ? data : [] }));
    } catch (e) {
      setError(errText(e, "Failed to load rounds."));
    } finally {
      inflight.current.delete(key);
    }
  }, []);

  const createRound = useCallback(
    async (tid: string, body: Record<string, unknown>) => {
      startSave(`round-new-${tid}`);
      setError("");
      try {
        const { data } = await adminApi.post(`/admin-panel/tournaments/${tid}/rounds`, body);
        setRoundsByTournament((m) => ({ ...m, [tid]: [...(m[tid] || []), data] }));
        patchSelfCounts({ rounds: 1 });
        if (data.apiEnable) {
          clearOtherApiRounds(data._id);
          setSelfActiveRound({ _id: data._id, roundName: data.roundName }, tid);
        }
      } catch (e) {
        setError(errText(e, "Failed to create round."));
        throw e;
      } finally {
        endSave(`round-new-${tid}`);
      }
    },
    [startSave, endSave, patchSelfCounts, clearOtherApiRounds, setSelfActiveRound]
  );

  const updateRound = useCallback(
    async (tid: string, rid: string, body: Record<string, unknown>) => {
      startSave(rid);
      setError("");
      try {
        const { data } = await adminApi.put(`/admin-panel/tournaments/${tid}/rounds/${rid}`, body);
        setRoundsByTournament((m) => ({
          ...m,
          [tid]: (m[tid] || []).map((r) => (r._id === rid ? { ...r, ...data } : r)),
        }));
        if (data.apiEnable) {
          clearOtherApiRounds(rid);
          setSelfActiveRound({ _id: rid, roundName: data.roundName }, tid);
        } else if (body.apiEnable === false) {
          setOverview((ov) =>
            ov
              ? {
                  ...ov,
                  users: ov.users.map((u) =>
                    u._id === selfId && u.activeApiRound?._id === rid ? { ...u, activeApiRound: null } : u
                  ),
                }
              : ov
          );
        }
      } catch (e) {
        setError(errText(e, "Round update failed."));
        throw e;
      } finally {
        endSave(rid);
      }
    },
    [startSave, endSave, clearOtherApiRounds, setSelfActiveRound, selfId]
  );

  const deleteRound = useCallback(
    async (tid: string, rid: string) => {
      startSave(rid);
      setError("");
      try {
        await adminApi.delete(`/admin-panel/tournaments/${tid}/rounds/${rid}`);
        setRoundsByTournament((m) => ({ ...m, [tid]: (m[tid] || []).filter((r) => r._id !== rid) }));
        patchSelfCounts({ rounds: -1 });
        setOverview((ov) =>
          ov
            ? {
                ...ov,
                users: ov.users.map((u) =>
                  u._id === selfId && u.activeApiRound?._id === rid ? { ...u, activeApiRound: null } : u
                ),
              }
            : ov
        );
      } catch (e) {
        setError(errText(e, "Round delete failed."));
        throw e;
      } finally {
        endSave(rid);
      }
    },
    [startSave, endSave, patchSelfCounts, selfId]
  );

  const value: AdminDataValue = {
    loading,
    error,
    setError,
    overview,
    tournaments,
    roundsByTournament,
    activityByUser,
    isSaving,
    refreshAll,
    createUser,
    updateUser,
    setUserAccess,
    deleteUser,
    loadActivity,
    loadRounds,
    createRound,
    updateRound,
    deleteRound,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
