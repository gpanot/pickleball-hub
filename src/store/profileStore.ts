"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type PlayerPreferences = {
  timeSlots:
    | "weekday_evenings"
    | "weekends"
    | "weekday_mornings"
    | "weekday_afternoons"
    | "weekend_evenings";
  level: "casual" | "intermediate" | "competitive";
  travelTime: "10min" | "15min" | "any";
  clickedSessions: string[];
  visitCount: number;
};

interface ProfileStore {
  profileId: string | null;
  zaloId: string | null;
  displayName: string | null;
  preferences: PlayerPreferences | null;
  hasCompletedOnboarding: boolean;
  visitCount: number;
  showZaloPrompt: boolean;
  zaloPromptDismissed: boolean;

  setPreferences: (p: Omit<PlayerPreferences, "clickedSessions" | "visitCount">) => void;
  completeOnboarding: () => void;
  logClickedSession: (sessionId: string) => void;
  incrementVisit: () => void;
  dismissZaloPrompt: () => void;
  saveToServer: (zaloId?: string, displayName?: string) => Promise<void>;
}

function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profileId: null,
      zaloId: null,
      displayName: null,
      preferences: null,
      hasCompletedOnboarding: false,
      visitCount: 0,
      showZaloPrompt: false,
      zaloPromptDismissed: false,

      setPreferences: (p) => {
        const existing = get().preferences;
        set({
          preferences: {
            ...p,
            clickedSessions: existing?.clickedSessions ?? [],
            visitCount: existing?.visitCount ?? 0,
          },
        });
      },

      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true });
      },

      logClickedSession: (sessionId) => {
        const prefs = get().preferences;
        if (!prefs) return;
        if (prefs.clickedSessions.includes(sessionId)) return;
        set({
          preferences: {
            ...prefs,
            clickedSessions: [...prefs.clickedSessions, sessionId],
          },
        });
      },

      incrementVisit: () => {
        const state = get();
        const newCount = state.visitCount + 1;
        const shouldShowZalo =
          newCount >= 3 &&
          state.hasCompletedOnboarding &&
          state.zaloId === null &&
          !state.zaloPromptDismissed;
        set({
          visitCount: newCount,
          showZaloPrompt: shouldShowZalo,
        });
      },

      dismissZaloPrompt: () => {
        set({ showZaloPrompt: false, zaloPromptDismissed: true });
      },

      saveToServer: async (zaloId?: string, displayName?: string) => {
        const state = get();
        let id = state.profileId;
        if (!id) {
          id = generateUuid();
          set({ profileId: id });
        }
        const updatedZaloId = zaloId ?? state.zaloId;
        const updatedDisplayName = displayName ?? state.displayName;

        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: id,
            zaloId: updatedZaloId,
            displayName: updatedDisplayName,
            preferences: state.preferences,
          }),
        });

        if (res.ok) {
          set({
            zaloId: updatedZaloId,
            displayName: updatedDisplayName,
            showZaloPrompt: false,
          });
        }
      },
    }),
    {
      name: "player-profile",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && !state.profileId) {
          state.profileId = generateUuid();
        }
      },
    },
  ),
);
