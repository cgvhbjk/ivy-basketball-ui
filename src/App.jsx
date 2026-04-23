import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import ComparisonLab from './pages/ComparisonLab.jsx'
import MatchupAnalyzer from './pages/MatchupAnalyzer.jsx'
import InsightsLab from './pages/InsightsLab.jsx'
import PlayerLab from './pages/PlayerLab.jsx'

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: '#0d0d14' }}>
      <Navbar />
      <Routes>
        <Route path="/"          element={<ComparisonLab />} />
        <Route path="/analyzer"  element={<MatchupAnalyzer />} />
        <Route path="/insights"  element={<InsightsLab />} />
        <Route path="/players"   element={<PlayerLab />} />
      </Routes>
    </div>
  )
}
