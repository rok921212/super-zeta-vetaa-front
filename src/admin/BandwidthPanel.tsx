import React, { useCallback, useEffect, useState } from "react";
import adminApi from "./adminApi";
import { Banner, Spinner, Card, Th, Td, Button } from "./ui";

interface RouteRow {
  route: string;
  count: number;
  bytes: number;
}

interface BandwidthRow {
  owner: string;
  username: string | null;
  email: string | null;
  httpWire: number;
  httpReqs: number;
  wsWire: number;
  cacheWrite: number;
  total: number;
  wsByKind: Record<string, number>;
  wsConnects: Record<string, number>;
  sockets: Record<string, number>;
  routes: RouteRow[];
}

interface BandwidthReport {
  since: string;
  totals: { httpWire: number; wsWire: number; cacheWrite: number };
  rows: BandwidthRow[];
}

const fmtMb = (n: number) => {
  const mb = n / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb >= 1 ? mb.toFixed(1) : mb.toFixed(2)} MB`;
};

const fmtTime = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const ownerLabel = (r: BandwidthRow) => {
  if (r.username) return r.username;
  if (r.owner === "anon") return "Not attributed";
  if (r.owner.startsWith("t:")) return `Deleted tournament ${r.owner.slice(2, 10)}`;
  return `Deleted user ${r.owner.slice(0, 8)}`;
};

// "relay 1 · overlay 6" — open sockets now, with connects since reset in brackets.
const kindList = (now: Record<string, number>, connects: Record<string, number>) => {
  const kinds = Array.from(new Set([...Object.keys(now), ...Object.keys(connects)])).sort();
  if (!kinds.length) return "—";
  return kinds.map((k) => `${k} ${now[k] || 0} (${connects[k] || 0})`).join(" · ");
};

const BandwidthPanel: React.FC = () => {
  const [report, setReport] = useState<BandwidthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport((await adminApi.get<BandwidthReport>("/admin-panel/bandwidth")).data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not load bandwidth");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async () => {
    try {
      await adminApi.post("/admin-panel/bandwidth/reset");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not reset");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="ap-display text-lg font-bold uppercase tracking-tight">Bandwidth</h2>
        <div className="flex items-center gap-2">
          {report && <span className="ap-mono text-[10px] text-[#55565C]">since {fmtTime(report.since)}</span>}
          <Button onClick={() => void load()} className="!px-3 !py-1.5">
            Refresh
          </Button>
          <Button variant="danger" onClick={() => void reset()} className="!px-3 !py-1.5">
            Reset
          </Button>
        </div>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {!report ? (
        <Card className="p-6">{loading ? <Spinner label="Loading bandwidth" /> : null}</Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["HTTP", report.totals.httpWire],
                ["WebSocket", report.totals.wsWire],
                ["Cache writes", report.totals.cacheWrite],
              ] as [string, number][]
            ).map(([label, value]) => (
              <Card key={label} className="p-4">
                <div className="ap-display text-2xl font-extrabold">{fmtMb(value)}</div>
                <div className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase mt-1">{label}</div>
              </Card>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[860px]">
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Total</Th>
                  <Th>HTTP</Th>
                  <Th>WebSocket</Th>
                  <Th>Cache writes</Th>
                  <Th>Sockets now (connects)</Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr>
                    <Td className="ap-mono text-[11px] text-[#55565C]">No traffic since the last reset.</Td>
                  </tr>
                )}
                {report.rows.map((r) => (
                  <React.Fragment key={r.owner}>
                    <tr className="cursor-pointer" onClick={() => setOpen(open === r.owner ? null : r.owner)}>
                      <Td>
                        <div className="text-sm text-[#F4F2EE]">{ownerLabel(r)}</div>
                        {r.email && <div className="ap-mono text-[10px] text-[#55565C]">{r.email}</div>}
                      </Td>
                      <Td className="ap-mono text-[12px] text-[#F4F2EE]">{fmtMb(r.total)}</Td>
                      <Td className="ap-mono text-[12px] text-[#93959C]">
                        {fmtMb(r.httpWire)} · {r.httpReqs} req
                      </Td>
                      <Td className="ap-mono text-[12px] text-[#93959C]">{fmtMb(r.wsWire)}</Td>
                      <Td className="ap-mono text-[12px] text-[#93959C]">{fmtMb(r.cacheWrite)}</Td>
                      <Td className="ap-mono text-[11px] text-[#93959C]">{kindList(r.sockets, r.wsConnects)}</Td>
                    </tr>
                    {open === r.owner && (
                      <tr>
                        <td colSpan={6} className="border-b border-[#1B1C21] px-4 py-3">
                          <div className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase mb-2">
                            Top routes
                          </div>
                          {r.routes.length === 0 ? (
                            <p className="ap-mono text-[11px] text-[#55565C]">No HTTP requests.</p>
                          ) : (
                            r.routes.map((x) => (
                              <div key={x.route} className="ap-mono text-[11px] text-[#93959C] flex gap-3">
                                <span className="text-[#F4F2EE] w-20 shrink-0">{fmtMb(x.bytes)}</span>
                                <span className="w-16 shrink-0">{x.count} req</span>
                                <span className="break-all">{x.route}</span>
                              </div>
                            ))
                          )}
                          <div className="ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase mt-3 mb-2">
                            WebSocket by client
                          </div>
                          <p className="ap-mono text-[11px] text-[#93959C]">
                            {Object.keys(r.wsByKind).length
                              ? Object.entries(r.wsByKind)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([k, v]) => `${k} ${fmtMb(v)}`)
                                  .join(" · ")
                              : "—"}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          <p className="ap-mono text-[10px] text-[#55565C]">
            Bytes sent by the server since the last reset or restart. Overlay and relay traffic is counted against the
            tournament's owner. "overlay" sockets reach the cloud directly; "relay" is one desktop app serving all of
            that machine's overlays. Database traffic is not included.
          </p>
        </>
      )}
    </section>
  );
};

export default BandwidthPanel;
