import { useCallback, useEffect, useState } from "react";
import api from "../login/api";

// Which built-in themes (Theme1..ThemeN) this account may pick, as set by an
// admin in the admin panel (User.allowedThemes). null = every theme; admins
// always get every theme. Read from GET /api/users/me, cached in
// sessionStorage for a minute so the theme picker and the Designer don't
// refetch on every mount, and refreshed when the tab regains focus.
//
// Only the pickers read this: overlay links keep rendering whatever theme
// they name, so nothing already on air breaks when an admin narrows a list.

const KEY = "cache:v1:allowedThemes";
const TTL_MS = 60_000;
const EVT = "allowedthemes:update";

type Stored = { allowed: string[] | null; ts: number };

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p.ts === "number" ? (p as Stored) : null;
  } catch {
    return null;
  }
}

function write(allowed: string[] | null): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ allowed, ts: Date.now() }));
  } catch {
    /* private mode / quota — best effort */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: allowed }));
  } catch {
    /* non-DOM */
  }
}

/** The allowed list from a /users/me document: null = every theme. */
export function allowedThemesOf(user: any): string[] | null {
  if (!user || user.isAdmin) return null;
  return Array.isArray(user.allowedThemes) ? user.allowedThemes : null;
}

/** Keep only the built-in themes in `allowed` (null = keep all). */
export function filterThemes<T extends string>(themes: readonly T[], allowed: string[] | null): T[] {
  if (!allowed) return [...themes];
  const ok = new Set(allowed);
  return themes.filter((t) => ok.has(t));
}

let inFlight: Promise<void> | null = null;

export async function refreshAllowedThemes(force = false): Promise<void> {
  const cached = read();
  if (!force && cached && Date.now() - cached.ts < TTL_MS) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data } = await api.get("/users/me");
      write(allowedThemesOf(data));
    } catch {
      /* offline / signed out: keep what we had */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useAllowedThemes(): {
  allowed: string[] | null;
  isAllowed: (theme: string) => boolean;
  filter: <T extends string>(themes: readonly T[]) => T[];
} {
  const [allowed, setAllowed] = useState<string[] | null>(() => read()?.allowed ?? null);

  useEffect(() => {
    const onUpdate = (e: Event) => setAllowed(((e as CustomEvent).detail as string[] | null) ?? null);
    const onFocus = () => { if (document.visibilityState !== "hidden") refreshAllowedThemes(); };
    window.addEventListener(EVT, onUpdate);
    window.addEventListener("focus", onFocus);
    refreshAllowedThemes();
    return () => {
      window.removeEventListener(EVT, onUpdate);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const isAllowed = useCallback((theme: string) => !allowed || allowed.includes(theme), [allowed]);
  const filter = useCallback(<T extends string>(themes: readonly T[]) => filterThemes(themes, allowed), [allowed]);
  return { allowed, isAllowed, filter };
}
