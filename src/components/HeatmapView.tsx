"use client";

/**
 * HeatmapView
 *
 * Renders a Leaflet map with two layers on top of tiles:
 *   1. Bubble markers  — sized L.divIcon circles showing player counts, clickable for popups
 *   2. User dot        — static pulsing blue dot at geolocation (if available)
 *
 * A "Locate Me" control sits top-right below the zoom controls.
 * Bubbles are cleared and redrawn on every slider (selectedDupr) change.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeatmapVenue } from "@/lib/queries";
import { useGeoStore } from "@/store/geoStore";

const HCM_CENTER: [number, number] = [10.79, 106.71];
const DEFAULT_ZOOM = 12;

export interface HeatmapViewProps {
  venues: HeatmapVenue[];
  selectedDupr: number;
  className?: string;
  /**
   * Called before opening a venue popup. Receives a callback that opens the popup.
   * Should return true to allow the popup, false to block (e.g. show login modal).
   */
  onBubbleClick?: (openPopup: () => void) => boolean;
}

// ── band helpers ──────────────────────────────────────────────────────────────

function bandRange(selected: number) {
  const lo = Math.round((selected - 0.1) * 10) / 10;
  const hi = Math.round((selected + 0.1) * 10) / 10;
  return { lo: lo.toFixed(1), hi: hi.toFixed(1) };
}

function countInBand(venue: HeatmapVenue, loN: number, hiN: number): number {
  let n = 0;
  for (const [bucket, c] of Object.entries(venue.playersByDupr)) {
    const b = parseFloat(bucket);
    if (b >= loN && b <= hiN) n += c;
  }
  return n;
}

// ── bubble styling ────────────────────────────────────────────────────────────

function getBubbleRadius(norm: number): number {
  const minRadius = 12;
  const maxRadius = 40;
  return Math.round(minRadius + norm * (maxRadius - minRadius));
}

function getBubbleColor(norm: number): string {
  if (norm <= 0.33) return "#22c55e";
  if (norm <= 0.66) return "#f97316";
  return "#ef4444";
}

function buildBubbleIcon(count: number, norm: number): L.DivIcon {
  const size = getBubbleRadius(norm) * 2; // diameter
  const color = getBubbleColor(norm);
  const fontSize = size < 28 ? 11 : 13;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid white;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:${fontSize}px;color:white;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      font-family:system-ui,sans-serif;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// ── popup ─────────────────────────────────────────────────────────────────────

function buildPopupHtml(venue: HeatmapVenue, lo: string, hi: string, count: number): string {
  const venueParam = venue.venueIds.join(",");
  const sessionsUrl = `/?venue=${encodeURIComponent(venueParam)}`;

  // Clubs sorted by player count desc (already sorted from query layer)
  const activeClubs = venue.clubs.filter((c) => c.players > 0 || c.sessions > 0);
  const topClub = activeClubs[0];
  const otherClubs = activeClubs.slice(1);

  // Title: venue name + top club name if different
  const titleLine = venue.venueName;
  const subTitleLine =
    topClub && topClub.venueName.toLowerCase() !== venue.venueName.toLowerCase()
      ? `<div style="font-size:11px;color:#6d28d9;font-weight:600;margin-bottom:2px;">${topClub.venueName}</div>`
      : "";

  let clubsHtml = "";
  if (otherClubs.length > 0) {
    const lines = otherClubs
      .map(
        (c) =>
          `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.venueName}</span>
            <span style="white-space:nowrap;font-weight:600;">${c.players} players</span>
          </div>`,
      )
      .join("");
    clubsHtml = `
      <div style="border-top:1px solid #e5e7eb;margin:8px 0 6px;padding-top:6px;">
        <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Also at this court</div>
        <div style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;">
          ${lines}
        </div>
      </div>`;
  }

  return `
    <div style="font-family:system-ui,sans-serif;min-width:210px;max-width:290px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${titleLine}</div>
      ${subTitleLine}
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">DUPR ${lo} – ${hi}</div>
      <div style="display:flex;gap:16px;margin-bottom:6px;">
        <div>
          <div style="font-size:18px;font-weight:800;color:#6d28d9;">${count}</div>
          <div style="font-size:10px;color:#6b7280;">players in band</div>
        </div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#6d28d9;">${venue.totalSessions90d}</div>
          <div style="font-size:10px;color:#6b7280;">sessions (90d)</div>
        </div>
      </div>
      ${clubsHtml}
      <a href="${sessionsUrl}"
         style="display:inline-block;background:#6d28d9;color:#fff;font-size:11px;font-weight:600;
                padding:5px 12px;border-radius:6px;text-decoration:none;margin-top:2px;">
        View upcoming sessions →
      </a>
    </div>`;
}

// ── user dot ──────────────────────────────────────────────────────────────────

function buildUserDotIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#3b82f6;border:2px solid white;
      box-shadow:0 0 0 4px rgba(59,130,246,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ── component ─────────────────────────────────────────────────────────────────

export function HeatmapView({ venues, selectedDupr, className = "h-[480px] w-full", onBubbleClick }: HeatmapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const bubblesRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);

  // Keep onBubbleClick in a ref so marker listeners always call the latest version
  // without needing to redraw bubbles every time the gate counter changes
  const onBubbleClickRef = useRef(onBubbleClick);
  onBubbleClickRef.current = onBubbleClick;

  const { lat: geoLat, lng: geoLng, locating, locate } = useGeoStore();

  // ── build normalised entries for current DUPR band ────────────────────────
  const getEntries = useCallback(() => {
    const { lo, hi } = bandRange(selectedDupr);
    const loN = parseFloat(lo);
    const hiN = parseFloat(hi);

    const raw: { venue: HeatmapVenue; count: number }[] = [];
    for (const v of venues) {
      const count = countInBand(v, loN, hiN);
      if (count > 0) raw.push({ venue: v, count });
    }
    const maxCount = Math.max(1, ...raw.map((e) => e.count));
    return {
      entries: raw.map((e) => ({ ...e, norm: e.count / maxCount })),
      lo,
      hi,
    };
  }, [venues, selectedDupr]);

  // ── init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: HCM_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 18,
    }).addTo(map);

    // Wait for the container to have real pixel dimensions before declaring ready
    let ready = false;
    const markReady = () => {
      if (ready || el.clientWidth === 0 || el.clientHeight === 0) return;
      ready = true;
      ro.disconnect();
      map.invalidateSize();
      setMapReady(true);
    };
    const ro = new ResizeObserver(markReady);
    ro.observe(el);
    markReady();

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      bubblesRef.current = [];
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── redraw bubbles on slider / venue change ────────────────────────────────
  const updateBubbles = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous bubbles
    for (const m of bubblesRef.current) {
      try { map.removeLayer(m); } catch { /* stale */ }
    }
    bubblesRef.current = [];

    const { entries, lo, hi } = getEntries();

    for (const { venue, count, norm } of entries) {
      const icon = buildBubbleIcon(count, norm);
      const marker = L.marker([venue.lat, venue.lng], { icon, zIndexOffset: 400 });
      const popupContent = buildPopupHtml(venue, lo, hi, count);

      // Always pre-bind the popup so Leaflet knows about it
      marker.bindPopup(popupContent, { maxWidth: 280 });

      if (onBubbleClickRef.current) {
        // Intercept the click: run the gate check before Leaflet opens the popup
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          const gate = onBubbleClickRef.current;
          if (!gate) { marker.openPopup(); return; }
          const allowed = gate(() => { marker.openPopup(); });
          if (allowed) marker.openPopup();
        });
      }

      marker.addTo(map);
      bubblesRef.current.push(marker);
    }
  }, [getEntries]); // onBubbleClick read via ref — no dep needed

  useEffect(() => {
    if (!mapReady) return;
    updateBubbles();
  }, [mapReady, updateBubbles]);

  // ── user dot: update whenever geo changes ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (userMarkerRef.current) {
      try { map.removeLayer(userMarkerRef.current); } catch { /* stale */ }
      userMarkerRef.current = null;
    }

    if (geoLat !== null && geoLng !== null) {
      const marker = L.marker([geoLat, geoLng], {
        icon: buildUserDotIcon(),
        zIndexOffset: 1000,
        interactive: false,
      });
      marker.addTo(map);
      userMarkerRef.current = marker;
    }
  }, [mapReady, geoLat, geoLng]);

  // ── locate handler ────────────────────────────────────────────────────────
  const handleLocate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (geoLat !== null && geoLng !== null) {
      map.flyTo([geoLat, geoLng], 14, { animate: true, duration: 0.8 });
    } else {
      locate();
      setLocateMsg("Locating…");
      setTimeout(() => setLocateMsg(null), 3000);
    }
  }, [geoLat, geoLng, locate]);

  // Fly once position arrives after button press
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || geoLat === null || geoLng === null || locateMsg !== "Locating…") return;
    map.flyTo([geoLat, geoLng], 14, { animate: true, duration: 0.8 });
    setLocateMsg(null);
  }, [geoLat, geoLng, mapReady, locateMsg]);

  return (
    <div className="relative" style={{ height: "480px" }}>
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%" }}
        className="rounded-xl"
      />

      {/* Locate Me button — positioned below Leaflet zoom controls */}
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        title="Center on my location"
        style={{ position: "absolute", top: 80, right: 10, zIndex: 1000 }}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[4px] border-2 border-[rgba(0,0,0,0.2)] bg-white shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
      >
        {locating ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        ) : (
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="#22c55e" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        )}
      </button>

      {/* Locating feedback tooltip */}
      {locateMsg && (
        <div
          style={{ position: "absolute", top: 80, right: 48, zIndex: 1001 }}
          className="whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-xs text-white shadow-lg"
        >
          {locateMsg}
        </div>
      )}
    </div>
  );
}
