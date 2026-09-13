import React from "react";
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
