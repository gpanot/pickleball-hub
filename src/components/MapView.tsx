"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  fillRate: number;
  price: string;
  popup: string;
  eventUrl?: string;
  venueName?: string;
  clubName?: string;
  time?: string;
  joined?: number;
  maxPlayers?: number;
}

interface MapViewProps {
  pins: MapPin[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  showLocateButton?: boolean;
}

const HCM_CENTER: [number, number] = [10.79, 106.71];
const LOCATE_ZOOM = 14; // ~3km radius visible at this zoom

function pinBgColor(fillRate: number): string {
  if (fillRate >= 1) return "#ef4444";
  if (fillRate >= 0.75) return "#f59e0b";
  return "#10b981";
}

function createPinIcon(price: string, fillRate: number): L.DivIcon {
  const bg = pinBgColor(fillRate);
  const pct = Math.round(fillRate * 100);
  return L.divIcon({
    className: "",
    iconSize: [60, 32],
    iconAnchor: [30, 32],
    popupAnchor: [0, -34],
    html: `<div style="
      display:flex;flex-direction:column;align-items:center;gap:1px;font-family:system-ui,sans-serif;
    ">
      <div style="
        background:${bg};color:#fff;font-size:11px;font-weight:700;
        padding:2px 6px;border-radius:6px;white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,.3);line-height:1.3;text-align:center;
      ">${price}</div>
      <div style="
        background:#fff;color:${bg};font-size:9px;font-weight:600;
        padding:1px 4px;border-radius:4px;
        box-shadow:0 1px 2px rgba(0,0,0,.2);line-height:1.2;
      ">${pct}%</div>
      <div style="
        width:0;height:0;border-left:5px solid transparent;
        border-right:5px solid transparent;border-top:5px solid ${bg};
      "></div>
    </div>`,
  });
}

function venuePopupHtml(pin: MapPin): string {
  const fill = pin.maxPlayers ? Math.round((pin.joined ?? 0) / pin.maxPlayers * 100) : 0;
  const bg = pinBgColor(pin.fillRate);
  const barWidth = Math.min(fill, 100);
  return `<div style="font-family:system-ui,sans-serif;min-width:200px;max-width:260px;">
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${pin.venueName || pin.label}</div>
    ${pin.clubName ? `<div style="font-size:11px;color:#6b7280;margin-bottom:2px;">${pin.clubName}</div>` : ""}
    ${pin.time ? `<div style="font-size:11px;color:#6b7280;">🕐 ${pin.time}</div>` : ""}
    <div style="display:flex;align-items:center;gap:6px;margin:6px 0;">
      <span style="font-size:13px;font-weight:700;">${pin.price}</span>
      <span style="font-size:11px;color:#6b7280;">${pin.joined ?? 0}/${pin.maxPlayers ?? 0} joined</span>
    </div>
    <div style="background:#e5e7eb;border-radius:4px;height:6px;margin-bottom:8px;">
      <div style="background:${bg};height:100%;border-radius:4px;width:${barWidth}%;"></div>
    </div>
    ${pin.eventUrl ? `<a href="${pin.eventUrl}" target="_blank" rel="noopener noreferrer" onclick="window.clarity&&window.clarity('set','converted','reclub_click')" style="
      display:inline-block;background:#6d28d9;color:#fff;font-size:11px;font-weight:600;
      padding:5px 12px;border-radius:6px;text-decoration:none;
    ">Book on Reclub</a>` : ""}
  </div>`;
}

export function MapView({
  pins,
  center = HCM_CENTER,
  zoom = 12,
  className = "h-[400px] w-full",
  showLocateButton = false,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [locating, setLocating] = useState(false);

  const centerOnUser = useCallback(() => {
    if (!mapInstanceRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current!;
        map.setView([latitude, longitude], LOCATE_ZOOM, { animate: true });

        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          const icon = L.divIcon({
            className: "",
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            html: `<div style="
              width:18px;height:18px;border-radius:50%;
              background:#3b82f6;border:3px solid #fff;
              box-shadow:0 0 0 2px #3b82f6,0 2px 6px rgba(0,0,0,.3);
            "></div>`,
          });
          userMarkerRef.current = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 })
            .addTo(map)
            .bindTooltip("You are here", { direction: "top", offset: [0, -12] });
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      userMarkerRef.current = null;
    }

    const mapCenter: [number, number] =
      pins.length > 0 ? [pins[0].lat, pins[0].lng] : center;

    const map = L.map(mapRef.current, {
      center: mapCenter,
      zoom,
      zoomControl: true,
      attributionControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 18,
    }).addTo(map);

    const bounds: [number, number][] = [];

    for (const pin of pins) {
      const icon = createPinIcon(pin.price, pin.fillRate);
      const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
      if (pin.eventUrl || pin.venueName) {
        marker.bindPopup(venuePopupHtml(pin), { maxWidth: 280, className: "venue-popup" });
      } else {
        marker.bindPopup(pin.popup, { maxWidth: 250 });
      }
      marker.bindTooltip(pin.label, { direction: "top", offset: [0, -36] });
      bounds.push([pin.lat, pin.lng]);
    }

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
    }

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      userMarkerRef.current = null;
    };
  }, [pins, center, zoom]);

  return (
    <div className="relative isolate">
      <div ref={mapRef} className={`rounded-xl ${className}`} />
      {showLocateButton && (
        <button
          type="button"
          onClick={centerOnUser}
          disabled={locating}
          className="absolute top-3 right-3 z-[5000] rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-lg px-3 py-2.5 sm:py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-1.5 disabled:opacity-50 pointer-events-auto min-h-[44px]"
          title="Center on my location"
        >
          {locating ? (
            <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          )}
          <span className="hidden sm:inline">Center me</span>
        </button>
      )}
    </div>
  );
}
