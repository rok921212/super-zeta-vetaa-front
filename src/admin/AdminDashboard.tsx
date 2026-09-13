import React, { useState } from "react";
import { AdminUser } from "./adminApi";
import { AdminDataProvider, useAdminData } from "./AdminDataContext";
import { Screen, Button, Spinner, Card, Banner } from "./ui";
import OverviewPanel from "./OverviewPanel";
import UsersPanel from "./UsersPanel";
import TournamentsPanel from "./TournamentsPanel";

type Section = "overview" | "users" | "tournaments";

const SECTION_LABEL: Record<Section, string> = {
  overview: "Overview",
  users: "Users",
  tournaments: "Tournaments & Rounds",
};

const DashboardInner: React.FC<{ user: AdminUser; onSignOut: () => void }> = ({ user, onSignOut }) => {
  const { loading, error, overview } = useAdminData();
  const [section, setSection] = useState<Section>("overview");

  // Only the very first load blocks the UI. A later Refresh keeps every
  // section mounted (expand/scroll state preserved) and just swaps the data.
  const firstLoad = loading && !overview;

  return (
    <Screen>
      <header className="border-b border-[#24262B] bg-[#0B0C0E] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 bg-[#E11D2E]" />
            <span className="ap-display font-bold text-sm uppercase tracking-[0.1em]">Admin Console</span>
            {loading && !firstLoad && (
              <span className="ap-mono text-[10px] text-[#55565C] uppercase tracking-[0.15em]">refreshing…</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="ap-mono text-[11px] text-[#93959C] hidden sm:inline">{user.email}</span>
            <Button variant="danger" onClick={onSignOut} className="!px-3 !py-1.5">
              Sign out
            </Button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {(["overview", "users", "tournaments"] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`ap-mono text-[11px] tracking-[0.15em] uppercase px-4 py-2.5 border-b-2 whitespace-nowrap ${
                section === s
                  ? "border-[#E11D2E] text-[#F4F2EE]"
                  : "border-transparent text-[#55565C] hover:text-[#93959C]"
              }`}
            >
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {error && <Banner tone="error">{error}</Banner>}

        {firstLoad ? (
          <Card className="p-6">
            <Spinner label="Loading admin data" />
          </Card>
        ) : (
          <>
            <div hidden={section !== "overview"}>
              <OverviewPanel />
            </div>
            <div hidden={section !== "users"}>
              <UsersPanel currentUserId={user._id} />
            </div>
            <div hidden={section !== "tournaments"}>
              <TournamentsPanel />
            </div>
          </>
        )}
      </main>
    </Screen>
  );
};

const AdminDashboard: React.FC<{ user: AdminUser; onSignOut: () => void }> = ({ user, onSignOut }) => (
  <AdminDataProvider selfId={user._id}>
    <DashboardInner user={user} onSignOut={onSignOut} />
  </AdminDataProvider>
);

export default AdminDashboard;
