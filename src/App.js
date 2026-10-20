import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PublicThemeRenderer from "./dashboard/PublicThemeRenderer.tsx";
// Overlay routes wait for the desktop app's local relay (never the cloud).
import RelayGate from "./dashboard/RelayGate.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

// Every page is its own chunk, so an OBS overlay or the login page does not
// download the dashboard, Designer or admin code. The overlay renderer stays
// in the main bundle: it is the hot path.
const Dashboard = lazy(() => import("./dashboard/page.tsx"));
const Round = lazy(() => import("./dashboard/Round.tsx"));
const Match = lazy(() => import("./dashboard/Match.tsx"));
const Teams = lazy(() => import("./dashboard/MainTeams.tsx"));
const MatchDataViewer = lazy(() => import("./dashboard/matchDataController.tsx"));
const DisplayHud = lazy(() => import("./dashboard/DisplayHud.tsx"));
const Login = lazy(() => import("./login/page.tsx"));
const Home = lazy(() => import("./Home.tsx"));
// Hidden admin panel. Mounted as the lowest-priority "*" route (every real
// route above wins), so it only sees unmatched paths. It renders the panel
// only when the pathname equals REACT_APP_ADMIN_PATH, else a generic 404.
const AdminGate = lazy(() => import("./admin/AdminGate.tsx"));

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
        <Suspense fallback={null}>
        <Routes>

          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tournaments/:tournamentId/rounds" element={<Round />} />
          <Route path="/tournaments/:tournamentId/rounds/:roundId/matches" element={<Match />} />
          <Route path="/tournaments/:tournamentId/rounds/:roundId/matches/:matchId" element={<MatchDataViewer />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/displayhud" element={<DisplayHud />} />
          <Route path="/public/tournament/:tournamentId/round/:roundId/match/:matchId" element={<RelayGate><PublicThemeRenderer /></RelayGate>} />
          <Route path="/public/live/:overlayKey" element={<RelayGate><PublicThemeRenderer /></RelayGate>} />
          <Route path="/designer" element={<Suspense fallback={null}><DesignerList /></Suspense>} />
          <Route path="/designer/:id" element={<Suspense fallback={null}><DesignerEditor /></Suspense>} />
          <Route path="/o/:publicId" element={<RelayGate><Suspense fallback={null}><OverlayRuntime /></Suspense></RelayGate>} />
          {/* Hidden admin panel — must stay LAST. Catches every unmatched path;
              AdminGate renders the panel only for the exact secret pathname,
              otherwise a generic 404. */}
          <Route path="*" element={<AdminGate />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
