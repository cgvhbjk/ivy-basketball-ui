import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import MatchupAnalyzer from './pages/MatchupAnalyzer.jsx'
import InsightsLab from './pages/InsightsLab.jsx'
import PlayerLab from './pages/PlayerLab.jsx'
import EpaLab from './pages/EpaLab.jsx'
import LuckLab from './pages/LuckLab.jsx'

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: '#0e0e0e' }}>
      <Navbar />
      <Routes>
        <Route path="/"         element={<Navigate to="/analyzer" replace />} />
        <Route path="/analyzer" element={<MatchupAnalyzer />} />
        <Route path="/insights" element={<InsightsLab />} />
        <Route path="/players"  element={<PlayerLab />} />
        <Route path="/epa"      element={<EpaLab />} />
        <Route path="/luck"     element={<LuckLab />} />
      </Routes>
    </div>
  )
}
