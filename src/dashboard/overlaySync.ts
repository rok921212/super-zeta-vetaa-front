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
// The same answer and a 'logoFlag' push also carry the SWITCH FLAGS setting,
// handed to Themes/shared/hooks/logoFlagSwitch.ts.
//
// Permanent links (/public/live/<key>, /o/<publicId>?k=<key>) carry the
// account's overlay key instead of any tournament or round. They resolve the
// same target through GET /api/public/overlay-sync/key/<key>; with no target
// set there is nothing to render, so the hook hands back no ids at all.

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../login/api.tsx';
import SocketManager from './socketManager.tsx';
import { applyLogoFlagSetting } from '../Themes/shared/hooks/logoFlagSwitch.ts';

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
// Relays older than v6 cached this endpoint for 15s+, so a page mounted right
// after a change could be handed the previous answer — ask once more.
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

    // Only an ANSWERED resolve starts the gap: a failed one (OBS started before the relay,
    // a cold backend) retries on its own, 2s → 4s → … → 20s, instead of waiting for the next poll.
    let lastResolveAt = 0;
    let inFlight = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const resolve = async () => {
      if (inFlight || Date.now() - lastResolveAt < MIN_RESOLVE_GAP_MS) return;
      inFlight = true;
      clearTimeout(retry);
      try {
        const res = await api.get(key ? `public/overlay-sync/key/${key}` : `public/overlay-sync/${tid}`);
        lastResolveAt = Date.now();
        failures = 0;
        apply(res.data);
        applyLogoFlagSetting(res.data?.logoFlag);
      } catch {
        // keep what we hold
        failures++;
        if (alive) retry = setTimeout(resolve, Math.min(IDLE_KEY_POLL_MS, MIN_RESOLVE_GAP_MS * 2 ** (failures - 1)));
      } finally {
        inFlight = false;
      }
    };

    resolve();
    const recheck = setTimeout(resolve, RECHECK_AFTER_MS);
    const poll = setInterval(resolve, POLL_MS);
    const idlePoll = key
      ? setInterval(() => { if (!heldRef.current.target) resolve(); }, IDLE_KEY_POLL_MS)
      : undefined;

    const sock = SocketManager.getInstance().connect();
    const onInvalidated = (msg?: { reason?: string; sync?: unknown; logoFlag?: unknown }) => {
      if (msg?.reason === 'overlaySync') apply(msg.sync);
      else if (msg?.reason === 'logoFlag') applyLogoFlagSetting(msg.logoFlag);
    };
    // The local socket can stay connected while the relay's cloud leg drops; a push sent in
    // that window is lost, so ask again when the relay says its upstream is back.
    const onUpstream = (msg?: { connected?: boolean }) => { if (msg && msg.connected !== false) resolve(); };
    sock.on('publicDataInvalidated', onInvalidated);
    sock.on('connect', resolve);
    sock.on('relayUpstreamStatus', onUpstream);

    return () => {
      alive = false;
      clearTimeout(retry);
      sock.off('relayUpstreamStatus', onUpstream);
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
