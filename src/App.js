import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./dashboard/page.tsx";
import Round from "./dashboard/Round.tsx";
import Match from "./dashboard/Match.tsx";
import Teams from "./dashboard/MainTeams.tsx";
import MatchDataViewer from "./dashboard/matchDataController.tsx";
import DisplayHud from "./dashboard/DisplayHud.tsx";
import PublicThemeRenderer from "./dashboard/PublicThemeRenderer.tsx";
import Login from "./login/page.tsx";
import Home from "./Home.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
// Hidden admin panel. Mounted as the lowest-priority "*" route (every real
// route above wins), so it only sees unmatched paths. It renders the panel
// only when the pathname equals REACT_APP_ADMIN_PATH, else a generic 404.
import AdminGate from "./admin/AdminGate.tsx";

// Designer (lazy: the editor + engine code only loads on these routes).
//   /designer        your layouts (auth via the API 401 -> /login redirect)
//   /designer/:id    the editor (the API is owner-scoped: another user's id 404s)
//   /o/:publicId     public OBS output — published revisions only, no chrome
const DesignerList = lazy(() => import("./graphics/editor/DesignerList.tsx"));
const DesignerEditor = lazy(() => import("./graphics/editor/DesignerEditor.tsx"));
const OverlayRuntime = lazy(() => import("./graphics/runtime/OverlayRuntime.tsx"));

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Routes>

          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tournaments/:tournamentId/rounds" element={<Round />} />
          <Route path="/tournaments/:tournamentId/rounds/:roundId/matches" element={<Match />} />
          <Route path="/tournaments/:tournamentId/rounds/:roundId/matches/:matchId" element={<MatchDataViewer />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/displayhud" element={<DisplayHud />} />
          <Route path="/public/tournament/:tournamentId/round/:roundId/match/:matchId" element={<PublicThemeRenderer />} />
          <Route path="/public/live/:overlayKey" element={<PublicThemeRenderer />} />
          <Route path="/designer" element={<Suspense fallback={null}><DesignerList /></Suspense>} />
          <Route path="/designer/:id" element={<Suspense fallback={null}><DesignerEditor /></Suspense>} />
          <Route path="/o/:publicId" element={<Suspense fallback={null}><OverlayRuntime /></Suspense>} />
          {/* Hidden admin panel — must stay LAST. Catches every unmatched path;
              AdminGate renders the panel only for the exact secret pathname,
              otherwise a generic 404. */}
          <Route path="*" element={<AdminGate />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
