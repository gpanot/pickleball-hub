"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface HeatmapStore {
  freeClicksUsed: number;
  incrementFreeClick: () => void;
  /** Reset to 2 — used when user dismisses the login modal (one more free click before next gate) */
  softReset: () => void;
  /** Full reset — used after successful login */
  reset: () => void;
}

export const useHeatmapStore = create<HeatmapStore>()(
  persist(
    (set, get) => ({
      freeClicksUsed: 0,

      incrementFreeClick: () => {
        set({ freeClicksUsed: get().freeClicksUsed + 1 });
      },

      softReset: () => {
        set({ freeClicksUsed: 2 });
      },

      reset: () => {
        set({ freeClicksUsed: 0 });
      },
    }),
    {
      name: "heatmap-gate",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
