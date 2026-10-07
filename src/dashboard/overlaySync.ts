// SYNC OVERLAY — overlay-page side.
//
// An overlay link names a tournament + round in its URL. If the account that
// owns that tournament has a "sync target" set (the SYNC OVERLAY button on
// DisplayHud.tsx), every one of its overlay links renders the TARGET round
// instead, so the links already sitting in OBS never need re-pasting for a new
// tournament. With no target set this hook hands back the URL ids untouched.
//
// The redirect is resolved here, in the page: the overlay engine, the bulk
// endpoint and the local relay only ever see ordinary real ids, and a change of
// target is just an engine round change (engine.update).
//
// Sources of truth, newest `stamp` wins:
//   - localStorage (synchronous, so a hard OBS reload paints the synced round
//     on its first frame),
//   - GET /api/public/overlay-sync/<tournamentId> (through the relay, like bulk),
//   - the `publicDataInvalidated` socket event with reason 'overlaySync' (live
//     push; rev-less, so the engine itself ignores it).
//
// Permanent links (/public/live/<key>, /o/<publicId>?k=<key>) carry the
// account's overlay key instead of any tournament or round. They resolve the
// same target through GET /api/public/overlay-sync/key/<key>; with no target
// set there is nothing to render, so the hook hands back no ids at all.

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../login/api.tsx';
import SocketManager from './socketManager.tsx';

export interface OverlaySyncTarget {
  tournamentId: string;
  roundId: string;
  scheduleMatches: string[];
}

export interface OverlaySyncState {
  target: OverlaySyncTarget | null;
  stamp: number;
}

export interface OverlaySyncResult {
  /** The ids to actually render: the sync target's, or the URL's own. */
  tournamentId: string | undefined;
  roundId: string | undefined;
  /** True when the ids above are NOT the ones in the URL. */
  redirected: boolean;
  /** The target round's schedule picks — only meaningful when redirected. */
  scheduleMatches: string[];
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const STORAGE_PREFIX = 'overlaySync:v1:';
// The relay caches any GET /api/public/* for at least 15s, so a page mounted
// right after a change can be handed the previous answer — ask once more.
const RECHECK_AFTER_MS = 20_000;
// Safety net for a push missed while the socket (or the relay's cloud leg) was down.
const POLL_MS = 5 * 60_000;
const MIN_RESOLVE_GAP_MS = 2_000;
// A permanent link with no target is in no round room, so no push can reach
// it: ask again this often until the account switches permanent links on.
const IDLE_KEY_POLL_MS = 20_000;
const KEY_RE = /^[A-Za-z0-9]{8,64}$/;

const EMPTY: OverlaySyncState = { target: null, stamp: 0 };

/** Normalises an HTTP body / socket payload / stored blob; null if unusable. */
export function parseOverlaySync(raw: any): OverlaySyncState | null {
  if (!raw || typeof raw !== 'object') return null;
  const stamp = Number(raw.stamp);
  if (!Number.isFinite(stamp)) return null;
  const t = raw.target;
  if (!t) return { target: null, stamp };
  if (!OBJECT_ID_RE.test(String(t.tournamentId)) || !OBJECT_ID_RE.test(String(t.roundId))) return null;
  return {
    target: {
      tournamentId: String(t.tournamentId),
      roundId: String(t.roundId),
      scheduleMatches: Array.isArray(t.scheduleMatches) ? t.scheduleMatches.map(String) : [],
    },
    stamp,
  };
}

// `source` is what the link is resolved by: the URL's tournament id, or
// `k:<key>` for a permanent link.
function readStored(source: string | undefined): OverlaySyncState {
  if (!source) return EMPTY;
  try {
    return parseOverlaySync(JSON.parse(localStorage.getItem(STORAGE_PREFIX + source) || 'null')) || EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeStored(source: string, value: OverlaySyncState): void {
  try { localStorage.setItem(STORAGE_PREFIX + source, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function useOverlaySyncTarget(
  urlTournamentId: string | undefined,
  urlRoundId: string | undefined,
  overlayKey?: string | null
): OverlaySyncResult {
  const key = overlayKey && KEY_RE.test(overlayKey) ? overlayKey : undefined;
  const urlTid = urlTournamentId && OBJECT_ID_RE.test(urlTournamentId) ? urlTournamentId : undefined;
  const tid = key ? `k:${key}` : urlTid;

  const [held, setHeld] = useState(() => ({ tid, ...readStored(tid) }));
  const heldRef = useRef(held);
  heldRef.current = held;

  useEffect(() => {
    if (!tid) return;
    if (heldRef.current.tid !== tid) {
      const next = { tid, ...readStored(tid) };
      heldRef.current = next;
      setHeld(next);
    }

    let alive = true;
    const apply = (raw: any) => {
      const incoming = parseOverlaySync(raw);
      if (!alive || !incoming) return;
      const cur = heldRef.current;
      // Older than what we hold (a relay-cached answer, a late response): ignore.
      if (incoming.stamp < cur.stamp) return;
      if (incoming.stamp === cur.stamp && !!incoming.target === !!cur.target
        && incoming.target?.roundId === cur.target?.roundId) return;
      const next = { tid, ...incoming };
      heldRef.current = next;
      writeStored(tid, incoming);
      setHeld(next);
    };

    let lastResolveAt = 0;
    const resolve = async () => {
      if (Date.now() - lastResolveAt < MIN_RESOLVE_GAP_MS) return;
      lastResolveAt = Date.now();
      try {
        const res = await api.get(key ? `public/overlay-sync/key/${key}` : `public/overlay-sync/${tid}`);
        apply(res.data);
      } catch {
        /* keep what we hold — the next trigger retries */
      }
    };

    resolve();
    const recheck = setTimeout(resolve, RECHECK_AFTER_MS);
    const poll = setInterval(resolve, POLL_MS);
    const idlePoll = key
      ? setInterval(() => { if (!heldRef.current.target) resolve(); }, IDLE_KEY_POLL_MS)
      : undefined;

    const sock = SocketManager.getInstance().connect();
    const onInvalidated = (msg?: { reason?: string; sync?: unknown }) => {
      if (msg?.reason === 'overlaySync') apply(msg.sync);
    };
    sock.on('publicDataInvalidated', onInvalidated);
    sock.on('connect', resolve);

    return () => {
      alive = false;
      clearTimeout(recheck);
      clearInterval(poll);
      clearInterval(idlePoll);
      sock.off('publicDataInvalidated', onInvalidated);
      sock.off('connect', resolve);
    };
  }, [tid, key]);

  const target = held.tid === tid ? held.target : null;
  return useMemo(() => {
    if (key) {
      return target
        ? { tournamentId: target.tournamentId, roundId: target.roundId, redirected: true, scheduleMatches: target.scheduleMatches }
        : { tournamentId: undefined, roundId: undefined, redirected: true, scheduleMatches: [] };
    }
    const redirected = !!target && !!tid && !!urlRoundId
      && (target.tournamentId !== tid || target.roundId !== urlRoundId);
    return redirected
      ? { tournamentId: target!.tournamentId, roundId: target!.roundId, redirected, scheduleMatches: target!.scheduleMatches }
      : { tournamentId: urlTournamentId, roundId: urlRoundId, redirected: false, scheduleMatches: [] };
  }, [target, tid, key, urlTournamentId, urlRoundId]);
}
