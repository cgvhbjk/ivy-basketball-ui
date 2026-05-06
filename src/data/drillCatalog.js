// Drill recommendations keyed by Practice Insights category. Looked up from
// generateMatchupInsights — when an insight fires (e.g. "Pace mismatch"), the
// matching category's drills surface as suggested practice work.
//
// These are intentionally generic, well-known college drills. Per-team custom
// drill libraries are deferred — the user's eventual ask is "if you know the
// drills they like to do, recommend from those," which would require a
// per-team drill catalog and matching layer.

export const DRILL_CATALOG = {
  Pace: [
    { name: '11-Man Continuous',     focus: 'Sustained transition decision-making',     protocol: '11 players, full court, 3-on-2 / 2-on-1 continuous, 4 min × 3' },
    { name: 'Outlet & Sprint',       focus: 'Defensive rebound → outlet → score',       protocol: 'Trail rebounder hits ahead pass; finish under 5 sec, 10 reps' },
    { name: 'Zipper Get-Back',       focus: 'Transition defense reset after misses',    protocol: 'Live 5-on-5; on miss, defense sprints to paint within 3 sec' },
  ],
  Shooting: [
    { name: 'NBA Spot Shooting',     focus: 'Open-look make rate from rotation spots',  protocol: '5 spots × 5 makes per spot; track % across reps' },
    { name: 'Closeout Contest',      focus: 'Disciplined contest without fouling',      protocol: 'Shooter at 3, closeout from paint; high hand, no jump unless committed' },
    { name: 'Shell + Drive-Kick',    focus: 'Help/recover vs ball movement',            protocol: '4-on-4 shell, dummy offense kicks until open shot or shot clock' },
    { name: 'Curl/Flare/Fade',       focus: 'Reading off-ball screen action',           protocol: '2-on-2 with one screener; defender calls reaction live' },
  ],
  Rebounding: [
    { name: 'Block-Out War',         focus: 'Initiate contact before turning',          protocol: '2-on-2 in lane; defenders must hold OR away from rim for 2 sec' },
    { name: 'Foul-Line Bumper',      focus: 'Help-side rebounding from weakside',       protocol: 'Coach shoots from wing; weakside help crashes glass, 3 reps each' },
    { name: 'Outlet to Break',       focus: 'Rebound + immediate outlet under pressure',protocol: 'Defender contests rebound; rebounder must outlet to half within 2 dribbles' },
    { name: '5-on-5 No-Layups',      focus: 'Live transition rebounding',               protocol: 'Score only counted on rebound + putback or kick-out 3' },
  ],
  'Ball Security': [
    { name: '4-on-4 vs Press',       focus: 'Beat full-court pressure with movement',   protocol: 'Press for 8 sec; 0 turnovers required to advance to next possession' },
    { name: 'Trap-Escape Dribble',   focus: 'Reading and splitting half-court traps',   protocol: '2 defenders trap on catch; ball-handler must escape with 1 dribble' },
    { name: 'Live Two-Side',         focus: 'Strong-side decisions vs help defense',    protocol: 'PnR live; if double comes, must hit pocket pass within 1 sec' },
  ],
  'Interior Matchup': [
    { name: 'Catch-Hold-Score',      focus: 'Post catches with strong base',            protocol: 'Entry pass; receiver holds 1 sec before move, 3 moves × 5 reps' },
    { name: 'Drop-Coverage Reads',   focus: 'Bigs reading roller vs popper',            protocol: 'PnR with cone for screener; live read on roll vs short pop' },
    { name: 'Wall-Up No-Foul',       focus: 'Vertical contest without arm bar',         protocol: 'Drive at big with wall-up only; no fouls counted, 10 reps' },
  ],
  'Guard Experience': [
    { name: 'Late-Clock Decisioning',focus: 'Possession execution under 8-sec clock',   protocol: 'Live 5-on-5 starting at 8 on shot clock; track scoring rate' },
    { name: 'BLOB / SLOB Library',   focus: 'Inbounds set execution vs varied defense', protocol: '5 sets × 5 reps each; defense varies man / zone / face-guard' },
    { name: 'Two-for-One Finisher',  focus: 'End-of-quarter clock management',          protocol: '35-sec clock, must shoot before :05 to give opp short possession' },
  ],
  'Opponent Scheme': [
    { name: 'Scout-Team Mirror',     focus: 'Run opponent\'s primary actions vs starters',protocol: 'Scout team runs 5 favorite plays; starters defend 2 trips each' },
    { name: 'Press-Break Decision',  focus: 'Beat the same press the opponent runs',     protocol: 'Walk-through opponent press for 5 min, then live for 5 min' },
    { name: 'Action-of-the-Week',    focus: 'Repeated rep against opponent\'s key set',  protocol: '15 reps of opponent\'s most-run action; vary defensive coverage' },
  ],
}

// Lookup helper — returns up to `limit` drills for a category, or [] if none.
export function getDrillsForCategory(category, limit = 2) {
  const drills = DRILL_CATALOG[category]
  if (!drills) return []
  return drills.slice(0, limit)
}
