import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// #TA-T18 (owner gap #8 — منتقي خريطة دقيق) — replaces the raw lat/lng
// number inputs with an interactive click-to-pin map so operators set a
// precise pickup/drop-off point instead of typing decimal degrees by hand.
// Built on the same raw-leaflet + OpenStreetMap-tiles pattern already used
// by hr/field-tracking + fleet/telematics (no new dependency, no map key).
//
// Controlled component: it never owns the coordinate state — it reflects
// the lat/lng props onto a draggable marker and reports edits (map click
// or marker drag) back through onPick, so the existing form fields stay
// the single source of truth.

const RIYADH: [number, number] = [24.7136, 46.6753];

export function MapLocationPicker({
  lat,
  lng,
  onPick,
  height = 240,
}: {
  lat?: number;
  lng?: number;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Keep the latest onPick without forcing the init effect to re-run
  // (which would tear the map down on every parent render).
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const hasPoint =
    typeof lat === "number" && !Number.isNaN(lat) &&
    typeof lng === "number" && !Number.isNaN(lng);

  // Init once.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: hasPoint ? [lat as number, lng as number] : RIYADH,
      zoom: hasPoint ? 14 : 10,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onPickRef.current(
        Number(e.latlng.lat.toFixed(7)),
        Number(e.latlng.lng.toFixed(7)),
      );
    });
    mapInstance.current = map;
    // The container is mounted inside a just-revealed section, so leaflet
    // may have measured it at zero size — recalc on the next tick.
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapInstance.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect lat/lng → draggable marker.
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (!hasPoint) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }
    const pos: [number, number] = [lat as number, lng as number];
    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "",
        html:
          '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;' +
          'transform:rotate(-45deg);background:#0ea5e9;border:2px solid white;' +
          'box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 18],
      });
      const marker = L.marker(pos, { icon, draggable: true });
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        onPickRef.current(
          Number(ll.lat.toFixed(7)),
          Number(ll.lng.toFixed(7)),
        );
      });
      marker.addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(pos);
    }
    map.setView(pos, Math.max(map.getZoom(), 13));
  }, [lat, lng, hasPoint]);

  return (
    <div className="space-y-1">
      <div
        ref={mapRef}
        style={{ height, borderRadius: 10, zIndex: 0 }}
        className="border border-border"
      />
      <p className="text-[11px] text-muted-foreground">
        {hasPoint
          ? `الإحداثيات: ${(lat as number).toFixed(5)}, ${(lng as number).toFixed(5)} — انقر أو اسحب الدبوس للتعديل`
          : "انقر على الخريطة لتحديد الموقع بدقة"}
      </p>
    </div>
  );
}
