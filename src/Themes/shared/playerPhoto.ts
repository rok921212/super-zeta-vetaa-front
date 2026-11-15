// Several photos (poses) per player: overlays show one at random.
//
// The team form saves extra poses on each roster player (Team.players[].photos).
// An overlay page loads the tournament's pose list once
// (GET /api/public/tournaments/:id/player-photos, cached on the server and the
// local relay; only players with extra poses are in it), keyed by the player's
// main photo. `playerPhoto(picUrl)` swaps a main photo for one of that
// player's poses, picked at random and kept until the overlay view changes, so
// a card never flickers between poses while it is on screen and the next view
// can show another pose. The live feed is untouched: no new fields on the wire.
//
// PublicThemeRenderer calls loadPlayerPhotos(tournamentId) and
// reshufflePlayerPhotos() on each view change.

import { useSyncExternalStore } from 'react';
import api from '../../login/api.tsx';

let tournament: string | null = null;
let poses = new Map<string, string[]>();
const picks = new Map<string, string>();
let version = 0;
const subscribers = new Set<() => void>();

/** The stable part of an image URL (same rule as the backend's photoKey). */
export function photoKey(url: string): string {
  if (!url) return '';
  const i = url.lastIndexOf('/upload/');
  if (i < 0) return url.split('?')[0];
  const parts = url.slice(i + 8).split('?')[0].split('/');
  while (parts.length > 1 && (/^v\d+$/.test(parts[0]) || /^[a-z]{1,3}_[^/]*$/.test(parts[0]))) parts.shift();
  return parts.join('/');
}

export function loadPlayerPhotos(tournamentId: string | null | undefined): void {
  if (!tournamentId || tournamentId === tournament) return;
  tournament = tournamentId;
  poses = new Map();
  picks.clear();
  api.get(`/public/tournaments/${tournamentId}/player-photos`)
    .then((r) => {
      if (tournament !== tournamentId) return;
      const raw = r.data?.photos || {};
      poses = new Map(Object.entries(raw).filter(([, v]) => Array.isArray(v) && (v as unknown[]).length > 1) as [string, string[]][]);
      picks.clear();
      if (poses.size) { version++; subscribers.forEach((fn) => fn()); }
    })
    .catch(() => { /* older backend: main photos only */ });
}

/** A new random pose for every player on the next render (view change). */
export function reshufflePlayerPhotos(): void {
  picks.clear();
}

/** Keeps the wire's Cloudinary transform (e.g. f_auto) on the chosen pose. */
function sameTransform(original: string, chosen: string): string {
  const oi = original.lastIndexOf('/upload/');
  const ci = chosen.lastIndexOf('/upload/');
  if (oi < 0 || ci < 0) return chosen;
  const key = photoKey(original);
  const prefix = original.slice(0, original.lastIndexOf(key));
  const cHost = chosen.slice(0, ci);
  return prefix.startsWith(cHost) ? prefix + photoKey(chosen) : chosen;
}

/** `picUrl` itself, or one of that player's poses. */
export function playerPhoto<T extends string | null | undefined>(picUrl: T): T | string {
  if (!picUrl || !poses.size) return picUrl;
  const url = picUrl.trim();
  const key = photoKey(url);
  const list = poses.get(key);
  if (!list) return picUrl;
  let pick = picks.get(key);
  if (!pick) {
    pick = list[Math.floor(Math.random() * list.length)];
    picks.set(key, pick);
  }
  return sameTransform(url, pick);
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Re-renders the caller once the pose list has arrived. */
export function usePlayerPhotosVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
