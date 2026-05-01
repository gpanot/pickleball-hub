"use client";

import { create } from "zustand";

interface GeoState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  locating: boolean;
  locate: () => void;
}

export const useGeoStore = create<GeoState>((set) => ({
  lat: null,
  lng: null,
  error: null,
  locating: false,

  locate() {
    if (!navigator.geolocation) {
      set({ error: "Geolocation not supported" });
      return;
    }
    set({ locating: true, error: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          locating: false,
          error: null,
        });
      },
      (err) => {
        set({ locating: false, error: err.message });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  },
}));
