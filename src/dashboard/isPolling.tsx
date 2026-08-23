import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../login/api";
import SocketManager from "./socketManager";

interface Selection {
  _id: string;
  matchId: string;
  roundId: {
    _id: string;
    apiEnable: boolean;
    roundName: string;
  };
  tournamentId: string;
  createdAt: string;
  isSelected: boolean;
  isPollingActive: boolean;
}

interface PollingManagerProps {
  // Optional context from DisplayHud — when provided, PollingManager shows
  // the polling/live-data status for THIS tournament+round (whatever the
  // operator currently has open in the HUD), instead of falling back to
  // "whichever match happens to be flagged isSelected somewhere". Because
  // these come from DisplayHud's own React state, changing the dropdown
  // there re-renders this component with fresh props immediately — no
  // page refresh needed.
  tournamentId?: string;
  roundId?: string;
  // Optional label (e.g. "Match 3") so the status pill can say what it's
  // actually reporting on.
  matchLabel?: string;
  // Bumped by DisplayHud right after it selects a new live match, so the
  // selections list below gets re-fetched instead of waiting on the
  // `matchSelected` socket broadcast to round-trip. Without this, toggling
  // polling immediately after picking a match can race ahead of that
  // broadcast — see activeSelection below.
  refreshSignal?: number;
}

// Real transport-level connection state, not inferred from whether data
// happens to be arriving. Three states because "never connected yet"
// (cold start) and "was connected, now isn't" (dropped) mean different
// things to an operator and should read differently on screen.
type SocketStatus = "connecting" | "connected" | "disconnected";

const PollingManager: React.FC<PollingManagerProps> = ({ tournamentId, roundId, matchLabel, refreshSignal }) => {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // --- Real socket connection tracking ------------------------------------
  // Initialized by actually asking the shared socket whether it's connected
  // *right now*, not by assuming "false until proven otherwise". The socket
  // is a singleton (SocketManager) that may already have been created and
  // connected by some other component mounted earlier in the app (e.g.
  // Alerts, LiveStats) — in that case this component's very first render
  // should already reflect "connected", not spend a tick lying about it.
  const [socketStatus, setSocketStatus] = useState<SocketStatus>(() =>
    SocketManager.getInstance().isConnected() ? "connected" : "connecting"
  );

  // Live-data-arrival tracking — separate from "is polling toggled on".
  // This answers "is real match data actually flowing right now", which is
  // what an operator staring at this for hours actually needs to know.
  const [lastDataAt, setLastDataAt] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const pulseTimeoutRef = useRef<number | null>(null);
  const [, forceTick] = useState(0); // re-render once/sec to keep "Xs ago" fresh

  // --- Fetch selections on mount, and again whenever refreshSignal bumps
  // (DisplayHud does this right after selecting a new live match) so a
  // just-created selection is visible here without waiting on the
  // `matchSelected` socket broadcast alone.
  useEffect(() => {
    api
      .get<Selection[]>("/matchSelection/selected")
      .then((res) => {
        const uniqueSelections = Array.from(
          new Map(res.data.map((item) => [item._id, item])).values()
        );
        setSelections(uniqueSelections);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshSignal]);

  // --- Socket setup for selection/polling-toggle events + connection state
  // FIX: this now runs ONCE (mount-only deps), and cleans up its own
  // listeners with socket.off(...) before the shared socket could ever
  // accumulate duplicates. Previously this effect depended on
  // [activeMatchId] and re-subscribed on every change without ever
  // removing the old handlers — each stale handler kept firing forever
  // on the shared singleton socket.
  //
  // Also now attaches connect/disconnect/connect_error listeners so
  // `socketStatus` reflects the real wire state instead of being derived
  // indirectly from whether data happened to show up.
  useEffect(() => {
    const socketManager = SocketManager.getInstance();
    const socket = socketManager.connect();

    // Re-sync immediately in case connect() returned an already-connected
    // socket (created by another component before this one mounted) — we
    // must not wait for a 'connect' event that may never fire again.
    setSocketStatus(socket.connected ? "connected" : "connecting");

    const handleConnect = () => setSocketStatus("connected");
    const handleDisconnect = () => setSocketStatus("disconnected");
    const handleConnectError = () => setSocketStatus("disconnected");

    const handlePollingStatusUpdated = (updated: Selection) => {
      setSelections((prev) =>
        prev.map((s) =>
          s._id === updated._id ? { ...s, isPollingActive: updated.isPollingActive } : s
        )
      );
    };

    const handleMatchSelected = ({ selected }: { selected: Selection }) => {
      setSelections((prev) => {
        const updatedPrev = prev.map((s) => ({ ...s, isSelected: false }));
        const index = updatedPrev.findIndex((s) => s._id === selected._id);
        if (index !== -1) {
          updatedPrev[index] = { ...selected, isSelected: true };
          return updatedPrev;
        }
        return [...updatedPrev, { ...selected, isSelected: true }];
      });
    };

    const handleMatchDeselected = ({ matchId }: { matchId: string }) => {
      setSelections((prev) =>
        prev.map((s) =>
          s._id === matchId ? { ...s, isSelected: false, isPollingActive: false } : s
        )
      );
    };

    const handleMatchDeleted = ({ matchId }: { matchId: string }) => {
      setSelections((prev) => prev.filter((s) => s._id !== matchId));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("pollingStatusUpdated", handlePollingStatusUpdated);
    socket.on("matchSelected", handleMatchSelected);
    socket.on("matchDeselected", handleMatchDeselected);
    socket.on("matchDeleted", handleMatchDeleted);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("pollingStatusUpdated", handlePollingStatusUpdated);
      socket.off("matchSelected", handleMatchSelected);
      socket.off("matchDeselected", handleMatchDeselected);
      socket.off("matchDeleted", handleMatchDeleted);
      socketManager.disconnect(); // no-op, shared socket stays alive — kept for parity
    };
  }, []);

  // --- Which selection is "active"? ---
  // If DisplayHud told us the current tournament+round via props, prefer
  // the selection that actually matches it — this is what makes the panel
  // track whatever the operator is looking at right now, instead of an
  // arbitrary "first selected match" guess.
  const activeSelection = useMemo(() => {
    if (tournamentId && roundId) {
      // Caller told us exactly which tournament+round is on screen — only
      // ever act on THAT selection. Falling through to "some other
      // apiEnable'd selection" here would silently toggle polling for a
      // round the operator isn't even looking at (see the race described
      // where a just-picked match hasn't reached `selections` yet).
      const match = selections.find((s) => {
        const sRoundId = typeof s.roundId === "object" ? s.roundId._id : s.roundId;
        return s.tournamentId === tournamentId && sRoundId === roundId;
      });
      return match || null;
    }

    const apiEnabledSelections = selections.filter(
      (s) => s.roundId && typeof s.roundId === "object" && s.roundId.apiEnable
    );
    if (apiEnabledSelections.length > 0) {
      return apiEnabledSelections.find((s) => s.isSelected) || apiEnabledSelections[0];
    }
    return selections.find((s) => s.isSelected) || selections[0] || null;
  }, [selections, tournamentId, roundId]);

  const hasApiEnabled =
    !!activeSelection?.roundId &&
    typeof activeSelection.roundId === "object" &&
    activeSelection.roundId.apiEnable;

  // Derived, not separately-tracked state — this is what used to go stale
  // across the three places the old code manually mirrored it.
  const buttonState = !!(activeSelection?.isPollingActive && hasApiEnabled);

  const activeTournamentId = activeSelection?.tournamentId;
  const activeRoundId =
    activeSelection?.roundId && typeof activeSelection.roundId === "object"
      ? activeSelection.roundId._id
      : (activeSelection?.roundId as unknown as string | undefined);

  // Reset the "last data" indicator whenever the active round changes, so
  // stale freshness from a previous match can't linger on screen.
  useEffect(() => {
    setLastDataAt(null);
    setPulsing(false);
  }, [activeTournamentId, activeRoundId]);

  // Also reset the moment the socket actually drops. Without this, the
  // seconds-ago counter would otherwise keep counting up from the last real
  // liveMatchUpdate even while the wire is down — a "fake" live indicator.
  // Once reconnected, it should read "waiting for data" again until a fresh
  // liveMatchUpdate is confirmed, not resume counting from stale data.
  useEffect(() => {
    if (socketStatus !== "connected") {
      setLastDataAt(null);
      setPulsing(false);
    }
  }, [socketStatus]);

  // --- Live data confirmation ---
  // Joins the same round room PublicThemeRenderer uses and listens for the
  // actual 'liveMatchUpdate' event. Every time one arrives while polling is
  // on, this flashes the indicator and updates "last data Xs ago" — a real
  // confirmation that match data is flowing, not just that the toggle is
  // switched on.
  //
  // Also re-runs on socketStatus flipping back to "connected": room
  // membership lives server-side and is dropped whenever the socket
  // disconnects, so simply reconnecting the transport does NOT re-join the
  // room by itself — without this dependency, a drop+reconnect would go
  // quiet on liveMatchUpdate forever even though the wire looks healthy again.
  useEffect(() => {
    if (!activeTournamentId || !activeRoundId || !buttonState || socketStatus !== "connected") return;

    const socketManager = SocketManager.getInstance();
    const socket = socketManager.connect();
    socket.emit("joinRoundRoom", { tournamentId: activeTournamentId, roundId: activeRoundId });

    const handleLiveMatchUpdate = () => {
      setLastDataAt(Date.now());
      setPulsing(true);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = window.setTimeout(() => setPulsing(false), 900);
    };

    socket.on("liveMatchUpdate", handleLiveMatchUpdate);

    return () => {
      socket.off("liveMatchUpdate", handleLiveMatchUpdate);
      socket.emit("leaveRoundRoom", { tournamentId: activeTournamentId, roundId: activeRoundId });
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [activeTournamentId, activeRoundId, buttonState, socketStatus]);

  // Tick once a second so "Xs ago" stays live without needing new data —
  // but only while actually connected. No point (and actively misleading)
  // to keep incrementing a "freshness" counter while the socket is down.
  useEffect(() => {
    if (!buttonState || socketStatus !== "connected") return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [buttonState, socketStatus]);

  const secondsSinceData = lastDataAt !== null ? Math.max(0, Math.floor((Date.now() - lastDataAt) / 1000)) : null;

  // --- Toggle polling for the active match ---
  const handleTogglePollingForActive = async () => {
    if (!activeSelection) return;
    if (!hasApiEnabled) return;

    const newState = !activeSelection.isPollingActive;
    const prevSelections = selections;

    // Optimistic update — buttonState is derived, so this alone flips the UI.
    setSelections((prev) =>
      prev.map((s) => (s._id === activeSelection._id ? { ...s, isPollingActive: newState } : s))
    );

    setUpdating(true);
    try {
      const roundIdStr = typeof activeSelection.roundId === "object" ? activeSelection.roundId._id : activeSelection.roundId;
      await api.patch(
        `/matchSelection/${activeSelection.tournamentId}/${roundIdStr}/${activeSelection.matchId}/polling`,
        { isPollingActive: newState }
      );
    } catch (err: any) {
      console.error("Failed to update polling:", err);
      alert(err.message || 'Failed to update polling status');
      setSelections(prevSelections); // roll back optimistic update
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 rounded-xl border border-gray-700">
        <div className="w-4 h-4 border-2 border-gray-600 border-t-purple-500 rounded-full animate-spin"></div>
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    );
  }

  if (!activeSelection) return null;

  // Status priority: socket transport state always wins over anything
  // derived from data/polling, because none of the data-freshness claims
  // below are trustworthy if the wire itself isn't up.
  //   - CONNECTING: never connected yet (cold start / first load)
  //   - DISCONNECTED: was connected, dropped — socket.io is retrying
  //   - PAUSED: connected, but polling toggled off
  //   - LIVE (waiting): connected + polling on, no liveMatchUpdate confirmed yet
  //   - LIVE (Xs ago): connected + polling on + data confirmed flowing
  const statusLabel =
    socketStatus === "connecting"
      ? "CONNECTING…"
      : socketStatus === "disconnected"
        ? "DISCONNECTED — reconnecting…"
        : !buttonState
          ? "PAUSED"
          : secondsSinceData === null
            ? "LIVE — waiting for data"
            : `LIVE • data ${secondsSinceData}s ago`;

  const statusColor =
    socketStatus === "connecting"
      ? "blue"
      : socketStatus === "disconnected"
        ? "red"
        : !buttonState
          ? "gray"
          : secondsSinceData === null
            ? "amber"
            : "green";

  return (
    <div className="flex items-center gap-3">
      {matchLabel && (
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{matchLabel}</span>
      )}

      {/* Status Indicator */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-shadow duration-300 ${
          statusColor === "green"
            ? "bg-green-900/20 border-green-500/30"
            : statusColor === "amber"
              ? "bg-amber-900/20 border-amber-500/30"
              : statusColor === "red"
                ? "bg-red-900/20 border-red-500/30"
                : statusColor === "blue"
                  ? "bg-blue-900/20 border-blue-500/30"
                  : "bg-gray-800/50 border-gray-700"
        } ${pulsing ? "shadow-[0_0_14px_rgba(34,197,94,0.55)]" : ""}`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            statusColor === "green"
              ? `bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] ${pulsing ? "" : "animate-pulse"}`
              : statusColor === "amber"
                ? "bg-amber-500 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                : statusColor === "red"
                  ? "bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  : statusColor === "blue"
                    ? "bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.6)]"
                    : "bg-gray-500"
          }`}
        ></div>
        <span
          className={`text-xs font-medium uppercase tracking-wider ${
            statusColor === "green"
              ? "text-green-400"
              : statusColor === "amber"
                ? "text-amber-400"
                : statusColor === "red"
                  ? "text-red-400"
                  : statusColor === "blue"
                    ? "text-blue-400"
                    : "text-gray-500"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Toggle Button */}
      <button
        onClick={handleTogglePollingForActive}
        disabled={updating || !hasApiEnabled}
        className={`
          relative flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200
          ${!hasApiEnabled
            ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed border border-gray-700'
            : buttonState
              ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg shadow-green-900/30 hover:from-green-500 hover:to-green-600 active:scale-[0.98]'
              : 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-900/30 hover:from-red-500 hover:to-red-600 active:scale-[0.98]'
          }
          ${updating ? 'opacity-70' : ''}
        `}
        title={!hasApiEnabled ? 'API not enabled for this round' : ''}
      >
        {updating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Updating...</span>
          </>
        ) : (
          <div className={`relative w-10 h-5 rounded-full transition-colors ${buttonState ? 'bg-green-400' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${buttonState ? 'left-5' : 'left-0.5'}`}></div>
          </div>
        )}
      </button>

      {!hasApiEnabled && (
        <span className="text-xs text-yellow-500/70 italic">API disabled</span>
      )}
    </div>
  );
};

export default PollingManager;