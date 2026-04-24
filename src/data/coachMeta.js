// Head coach and playstyle metadata per school and year.
// Sources: public school athletic department records. Verify for latest season.

export const COACH_META = {
  harvard: {
    2022: { name: 'Tommy Amaker', style: 'Deliberate pace, defense-first, high-IQ half-court offense' },
    2023: { name: 'Tommy Amaker', style: 'Deliberate pace, defense-first, high-IQ half-court offense' },
    2024: { name: 'Tommy Amaker', style: 'Deliberate pace, defense-first, selective three-point attack' },
    2025: { name: 'Tommy Amaker', style: 'Deliberate pace, defense-first, selective three-point attack' },
  },
  yale: {
    2022: { name: 'James Jones', style: 'Up-tempo, inside-out balance, man-to-man defense' },
    2023: { name: 'James Jones', style: 'Up-tempo, inside-out balance, man-to-man defense' },
    2024: { name: 'James Jones', style: 'Up-tempo, versatile scoring, man-to-man defense' },
    2025: { name: 'James Jones', style: 'Up-tempo, motion offense, man-to-man defense' },
  },
  penn: {
    2022: { name: 'Steve Donahue', style: 'Zone-heavy defense, deliberate pace, motion offense' },
    2023: { name: 'Steve Donahue', style: 'Zone-heavy defense, deliberate pace, motion offense' },
    2024: { name: 'Ashley Howard', style: 'Pressure defense, transition offense, athletic roster' },
    2025: { name: 'Ashley Howard', style: 'Pressure defense, transition offense, athletic roster' },
  },
  princeton: {
    2022: { name: 'Mitch Henderson', style: 'Princeton motion system: back-cuts, patient half-court, spread floor' },
    2023: { name: 'Mitch Henderson', style: 'Princeton motion system: back-cuts, patient half-court, spread floor' },
    2024: { name: 'Mitch Henderson', style: 'Princeton motion system: back-cuts, patient half-court, spread floor' },
    2025: { name: 'Mitch Henderson', style: 'Princeton motion system: back-cuts, patient half-court, spread floor' },
  },
  dartmouth: {
    2022: { name: 'David McLaughlin', style: 'Up-tempo, transition-heavy, pressure defense, athleticism-based' },
    2023: { name: 'David McLaughlin', style: 'Up-tempo, transition-heavy, pressure defense, athleticism-based' },
    2024: { name: 'David McLaughlin', style: 'Up-tempo, transition-heavy, pressure defense' },
    2025: { name: 'David McLaughlin', style: 'Up-tempo, transition-heavy, pressure defense' },
  },
  cornell: {
    2022: { name: 'Brian Earl', style: 'Fast pace, 3-heavy perimeter attack, man-to-man defense' },
    2023: { name: 'Brian Earl', style: 'Fast pace, 3-heavy perimeter attack, man-to-man defense' },
    2024: { name: 'Brian Earl', style: 'Fast pace, 3-heavy perimeter attack, man-to-man defense' },
    2025: { name: 'Brian Earl', style: 'Fast pace, 3-heavy perimeter attack, man-to-man defense' },
  },
  brown: {
    2022: { name: 'Mike Martin', style: 'Physical post play, grinding pace, mix-and-match defense' },
    2023: { name: 'Mike Martin', style: 'Physical post play, grinding pace, mix-and-match defense' },
    2024: { name: 'Mike Martin', style: 'Physical post play, grinding pace, mix-and-match defense' },
    2025: { name: 'Mike Martin', style: 'Physical post play, grinding pace, mix-and-match defense' },
  },
  columbia: {
    2022: { name: 'Jim Engles', style: 'Slow deliberate pace, set-play offense, perimeter-oriented attack' },
    2023: { name: 'Jim Engles', style: 'Slow deliberate pace, set-play offense, perimeter-oriented attack' },
    2024: { name: 'Jim Engles', style: 'Slow deliberate pace, set-play offense, perimeter-oriented attack' },
    2025: { name: 'Jim Engles', style: 'Slow deliberate pace, set-play offense, perimeter-oriented attack' },
  },
}

export function getCoach(school, year) {
  return COACH_META[school]?.[year] ?? { name: 'Unknown', style: 'No data available' }
}
