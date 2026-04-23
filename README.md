# Ivy League Basketball Analytics

A React web app for exploring Ivy League men's basketball data (2022–2025). Built on Barttorvik team and player statistics, it surfaces correlations, playing-style archetypes, roster composition insights, and individual player power ratings across all eight Ivy programs.

## Pages

### Comparison Lab (`/`)
Side-by-side team comparison across any season. Radar charts, four-factor breakdowns, and net efficiency trends for any two school/year combinations.

### Matchup Analyzer (`/analyzer`)
Head-to-head matchup projections using adjusted efficiency margins and historical Ivy performance.

### Insights Lab (`/insights`)
Three analysis modes:

- **Metric Correlation** — scatter any two team metrics (all 21 available) against each other across all 32 team-seasons. Pearson r, regression line, threshold detection, time-window stability, and style-interaction breakdowns.
- **Scheme Analysis** — classifies every team-season into offensive archetypes (Run & Gun / Transition Attack / Spread Offense / Grind It Out) and defensive archetypes (High Pressure / Rim Protection / Coverage / Standard), then compares outcome metrics across schemes via bar charts.
- **Roster & Bio** — aggregates per-player biodata (height, class year, positional mix) to the team-season level and correlates against outcomes. Also plots individual player biodata (height in inches, experience) against any per-game stat. Both views include a ranked table for direct comparison.

### Player Lab (`/players`)
Individual player profiles with radar charts (normalized within the Ivy pool), lineup-adjusted power ratings via least-squares regression on team net efficiency, an Ivy-wide power leaderboard, and position-type stat breakdowns with dual-axis charts.

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 18 + Vite |
| Charts | Recharts |
| State | Zustand |
| Styling | Tailwind CSS + inline styles |

## Data

All statistics sourced from [Barttorvik](https://barttorvik.com). Covers 2022–2025 regular seasons for Brown, Columbia, Cornell, Dartmouth, Harvard, Penn, Princeton, and Yale.

Team metrics: adjusted offensive/defensive efficiency, four factors, shooting splits, pace, predictive win%.  
Player metrics: per-game counting stats, eFG%, true shooting, usage, BPM, ORTG/DRTG, offensive/defensive rebounding rates.

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
