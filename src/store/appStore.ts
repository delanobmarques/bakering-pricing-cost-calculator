import { create } from 'zustand'

type AppState = {
  taxRate: number
  profitMargin: number
  overheadRate: number
  setTaxRate: (value: number) => void
  setProfitMargin: (value: number) => void
  setOverheadRate: (value: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  taxRate: 0.15,
  profitMargin: 1.3,
  overheadRate: 0.05,
  setTaxRate: (value) => set({ taxRate: value }),
  setProfitMargin: (value) => set({ profitMargin: value }),
  setOverheadRate: (value) => set({ overheadRate: value }),
}))
