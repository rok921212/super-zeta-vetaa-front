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
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
