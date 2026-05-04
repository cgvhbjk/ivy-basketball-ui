# Ivy League Basketball Analytics

A React web app for exploring Ivy League men's basketball data (2022–2025). Built on Barttorvik team and player statistics, it surfaces metric correlations, playing-style archetypes, roster composition insights, and individual player power ratings across all eight Ivy programs.

## Pages

### Matchup Analyzer (`/analyzer`)
Head-to-head matchup projections using adjusted efficiency margins and historical Ivy performance.

### Insights Lab (`/insights`)
Three analysis modes on one page:

- **Metric Correlation** — scatter any two of 21 team metrics across all 32 team-seasons (8 schools × 4 years). Shows Pearson r, regression line, automatic threshold detection (best split point on the x-axis), time-window stability (2022–23 vs 2024–25), and style-interaction breakdowns by tempo bucket or 3-point rate bucket.
- **Scheme Analysis** — classifies every team-season into offensive archetypes (Run & Gun / Transition Attack / Spread Offense / Grind It Out) and defensive archetypes (High Pressure / Rim Protection / Coverage / Standard), then compares any outcome metric across schemes via bar charts.
- **Roster & Bio** — aggregates per-player biodata (avg height, avg class-year experience, % guards/forwards/bigs) to the team-season level and scatters against any outcome metric with a regression line and ranked comparison table. A second panel scatters individual player biodata (height in inches, class year) against any per-game stat.

### Player Lab (`/players`)
Three tabs:

- **Profile** — player selector with radar chart normalized within the Ivy pool for the selected year, full efficiency stats, and a side-by-side roster comparison table with any other school/year.
- **Power Rank** — Ivy-wide leaderboard using lineup-adjusted power ratings (see below).
- **Positions** — average stats by Barttorvik position type with dual-axis bar chart (ORTG left axis, Pts/G right axis).

## Power Rating Methodology

Player power ratings use ordinary least squares on team net efficiency. For each team-season the pipeline computes minute-weighted averages of each player's centered ORTG and DRTG (centered = individual minus Ivy-wide average for that year). OLS regresses team `adjoe − adjde` on those two weighted features to learn `β_ortg` and `β_drtg`. Each player's rating is then:

```
power_rating = β_ortg × (ORTG − avg) × min_share
             + β_drtg × (DRTG − avg) × min_share
```

Because Barttorvik's ORTG/DRTG are already lineup-adjusted, the ratings implicitly capture spacing, screening, and off-ball contributions that show up in margin when a player is on the floor.

## Project Structure

```
ivy-basketball-ui/
├── src/
│   ├── pages/
│   │   ├── MatchupAnalyzer.jsx   # Head-to-head projections
│   │   ├── InsightsLab.jsx       # Correlation / Scheme / Biodata tabs
│   │   └── PlayerLab.jsx         # Player profiles + power leaderboard
│   ├── utils/
│   │   ├── insightEngine.js      # Pearson r, regression, scheme classification, biodata aggregation
│   │   └── powerRating.js        # OLS power rating computation
│   ├── store/
│   │   ├── useInsightStore.js    # Insight Lab state (saved insights, axis vars)
│   │   ├── usePlayerStore.js     # Player Lab state (school/year/player selection)
│   │   └── useStore.js           # Global comparison state
│   ├── data/
│   │   ├── teamSeasons.json      # 32 team-seasons (Barttorvik, 2022–2025)
│   │   ├── players.json          # All Ivy player-seasons (Barttorvik, 2022–2025)
│   │   └── constants.js          # School metadata, metric definitions
│   └── components/
│       ├── Navbar.jsx
│       └── shared/               # StatCard, TeamBadge
├── scripts/
│   └── fetch-data.mjs            # Fetches latest data from Barttorvik
├── package.json
└── vite.config.js
```

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 18 + Vite |
| Charts | Recharts |
| State | Zustand |
| Styling | Tailwind CSS + inline styles |

## Data

All statistics sourced from [Barttorvik](https://barttorvik.com). Covers 2022–2025 regular seasons for Brown, Columbia, Cornell, Dartmouth, Harvard, Penn, Princeton, and Yale.

**Team metrics (21):** adjusted offensive/defensive efficiency, four factors (eFG%, TOV%, ORB%, FT rate for both offense and defense), shooting splits (2P%, 3P%, 3PA rate), FT%, tempo, net efficiency, predictive win% (barthag).

**Player metrics:** per-game counting stats, eFG%, true shooting%, usage%, BPM, ORTG/DRTG, offensive/defensive rebound rate, assist rate, height (parsed to inches), class year (converted to 1–5 experience scale).

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5174`.

To re-fetch data from Barttorvik:

```bash
npm run fetch-data
```

## Schools Covered

Brown · Columbia · Cornell · Dartmouth · Harvard · Penn · Princeton · Yale
