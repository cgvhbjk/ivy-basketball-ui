import { create } from 'zustand'

const usePlayerStore = create((set) => ({
  selectedSchool: 'yale',
  selectedYear: 2025,
  selectedPlayer: null,
  compareSchool: 'princeton',
  compareYear: 2025,

  setSelectedSchool: (v) => set({ selectedSchool: v, selectedPlayer: null }),
  setSelectedYear: (v) => set({ selectedYear: v, selectedPlayer: null }),
  setSelectedPlayer: (v) => set({ selectedPlayer: v }),
  setCompareSchool: (v) => set({ compareSchool: v }),
  setCompareYear: (v) => set({ compareYear: v }),
}))

export default usePlayerStore
