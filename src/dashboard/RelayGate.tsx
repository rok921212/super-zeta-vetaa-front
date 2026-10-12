import React, { useEffect, useState } from "react";
import { probeRelay, markRelayReachable, markRelayUnreachable, RELAY_ONLY } from "../login/api";

// Overlay pages are relay-only (login/api.tsx RELAY_ONLY): they never talk to
// the cloud. This gate holds an overlay back until the desktop app's local
// relay answers, so an OBS source opened before the desktop app shows
// nothing (transparent — no message on stream) instead of erroring, and
// starts on its own once the app is opened. The operator-facing reminder
// lives in DisplayHud, never here.
//
// It only gates the FIRST mount: once the overlay has started, a later relay
// drop keeps it mounted with its last data — the socket and HTTP layer keep
// retrying the relay and resume when the supervisor respawns it.

const PROBE_MS = 3000;

const RelayGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(!RELAY_ONLY);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      const ok = await probeRelay();
      if (cancelled) return;
      if (ok) {
        markRelayReachable();
        setReady(true);
        return;
      }
      markRelayUnreachable();
      timer = setTimeout(attempt, PROBE_MS);
    };
    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  return ready ? <>{children}</> : null;
};

export default RelayGate;
