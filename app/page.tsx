"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Inline Supabase client (no external import path issues)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceRow = {
  id: number;
  place_type: string; // "birds" | "hikes" | "camps"
  name: string;
  state: string | null;
  subtype: string | null;
  notes: string | null;
  website: string | null;
  favorite: boolean | null;
  lat: number | null;
  lon: number | null;
};

export default function Home() {
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);

  // Debounce timers
  const bywaysTimerRef = useRef<any>(null);
  const placesTimerRef = useRef<any>(null);

  // Keep track of current place markers so we can clear them
  const placeMarkersRef = useRef<any[]>([]);

  // UI state (toggles)
  const [stateFilters, setStateFilters] = useState<Record<string, boolean>>({
    NC: true,
    VA: true,
    WV: true,
  });

  const [typeFilters, setTypeFilters] = useState<Record<string, boolean>>({
    birds: true,
    hikes: true,
    camps: true,
  });

  // --- Helper: selected values from toggles ---
  const selectedStates = Object.entries(stateFilters)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const selectedTypes = Object.entries(typeFilters)
    .filter(([, v]) => v)
    .map(([k]) => k);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

    if (!key) {
      console.error("Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local");
      return;
    }

    // Don't load the script twice
    if (document.getElementById("google-maps-script")) return;

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;

    script.onload = () => {
      const google = (window as any).google;

      const map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 36.2, lng: -79.0 },
        zoom: 7,
      });

      mapRef.current = map;

      // Byways styling (brown line)
      map.data.setStyle({
        strokeColor: "#5a3e2b",
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });

      // Shared InfoWindow (for both lines and points)
      const infoWindow = new google.maps.InfoWindow();
      infoWindowRef.current = infoWindow;

      // --- Byways click popup (line features in map.data layer) ---
      map.data.addListener("click", (event: any) => {
        const name = event.feature.getProperty("name") || "(No name)";
        const designats = event.feature.getProperty("designats") || "";

        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 280px;">
            <div style="font-weight: 700; margin-bottom: 4px;">${escapeHtml(
              name
            )}</div>
            <div>${escapeHtml(designats)}</div>
          </div>
        `;

        infoWindow.setContent(html);
        infoWindow.setPosition(event.latLng);
        infoWindow.open(map);
      });

      // --- Your icon style: white fill + red outline ---
      const makeIcon = (scale: number) => ({
        path: google.maps.SymbolPath.CIRCLE,
        scale,
        fillColor: "#fafbfb",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#f80808",
      });

      // Apply sizing to ALL place markers based on zoom
      const applySizingToPlaceMarkers = (z: number) => {
        const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
        const fontSize =
          z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

        for (const m of placeMarkersRef.current) {
          const emoji = (m as any).__emoji || "•";
          m.setIcon(makeIcon(scale));
          m.setLabel({ text: emoji, fontSize });
        }
      };

      applySizingToPlaceMarkers(map.getZoom());
      map.addListener("zoom_changed", () =>
        applySizingToPlaceMarkers(map.getZoom())
      );

      // -----------------------------
      // Load BYWAYS (via RPC) by bbox
      // -----------------------------
      const clearByways = () => {
        map.data.forEach((feature: any) => map.data.remove(feature));
      };

      const loadBywaysInView = async () => {
        const bounds = map.getBounds();
        if (!bounds) return;

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        const min_lng = sw.lng();
        const min_lat = sw.lat();
        const max_lng = ne.lng();
        const max_lat = ne.lat();

        // Use selectedStates toggle for byways too
        const states = selectedStates.length ? selectedStates : ["NC", "VA", "WV"];

        const { data, error } = await supabase.rpc("rpc_byways_in_bbox", {
          min_lng,
          min_lat,
          max_lng,
          max_lat,
          states,
        });

        if (error) {
          console.error("Byways RPC error:", error);
          return;
        }

        const fc = {
          type: "FeatureCollection",
          features: (data || [])
            .filter((r: any) => r.geom_geojson)
            .map((r: any) => ({
              type: "Feature",
              geometry: r.geom_geojson,
              properties: {
                byway_id: r.byway_id,
                name: r.name,
                designats: r.designats,
                state: r.state,
                source: r.source,
              },
            })),
        };

        clearByways();
        map.data.addGeoJson(fc as any);
      };

      const scheduleBywaysLoad = () => {
        if (bywaysTimerRef.current) clearTimeout(bywaysTimerRef.current);
        bywaysTimerRef.current = setTimeout(() => {
          loadBywaysInView();
        }, 300);
      };

      // -----------------------------------
      // Load PLACES (direct query) by bbox
      // -----------------------------------
      const clearPlaces = () => {
        for (const m of placeMarkersRef.current) {
          m.setMap(null);
        }
        placeMarkersRef.current = [];
      };

      const emojiForPlaceType = (t: string) => {
        if (t === "birds") return "🦅";
        if (t === "hikes") return "🚶"; // hiker
        if (t === "camps") return "🏕️";
        return "•";
      };

      const openPlacePopup = (row: PlaceRow, latLng: any) => {
        const name = row.name || "(No name)";
        const state = row.state || "";
        const subtype = row.subtype ? ` • ${row.subtype}` : "";
        const notes = row.notes ? `<div style="margin-top:6px;">${escapeHtml(row.notes)}</div>` : "";
        const website =
          row.website && row.website.startsWith("http")
            ? `<div style="margin-top:6px;"><a href="${row.website}" target="_blank" rel="noreferrer">Website</a></div>`
            : "";

        // NAVIGATION LINK (works great on phone)
        const destLat = row.lat;
        const destLon = row.lon;
        const navUrl =
          destLat != null && destLon != null
            ? `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`
            : null;

        const navLink = navUrl
          ? `<div style="margin-top:8px;">
               <a href="${navUrl}" target="_blank" rel="noreferrer">📍 Navigate</a>
             </div>`
          : "";

        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 280px;">
            <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(
              name
            )}</div>
            <div style="opacity:0.9;">${escapeHtml(
              (row.place_type || "").toUpperCase()
            )}${state ? " • " + escapeHtml(state) : ""}${escapeHtml(subtype)}</div>
            ${website}
            ${navLink}
            ${notes}
          </div>
        `;

        infoWindow.setContent(html);
        infoWindow.setPosition(latLng);
        infoWindow.open(map);
      };

      const loadPlacesInView = async () => {
        const bounds = map.getBounds();
        if (!bounds) return;

        // If user unchecks everything, show nothing
        if (!selectedStates.length || !selectedTypes.length) {
          clearPlaces();
          return;
        }

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        const minLon = sw.lng();
        const minLat = sw.lat();
        const maxLon = ne.lng();
        const maxLat = ne.lat();

        // Pull only what we need for markers + popups
        let q = supabase
          .from("places")
          .select(
            "id, place_type, name, state, subtype, notes, website, favorite, lat, lon"
          )
          .in("state", selectedStates)
          .in("place_type", selectedTypes)
          .gte("lon", minLon)
          .lte("lon", maxLon)
          .gte("lat", minLat)
          .lte("lat", maxLat);

        const { data, error } = await q;

        if (error) {
          console.error("Places query error:", error);
          return;
        }

        clearPlaces();

        const rows = (data || []) as PlaceRow[];
        const z = map.getZoom();
        applySizingToPlaceMarkers(z); // ensures scale/font are set for any markers that exist

        for (const r of rows) {
          if (r.lat == null || r.lon == null) continue;

          const m = new google.maps.Marker({
            position: { lat: r.lat, lng: r.lon },
            map,
            title: r.name,
          });

          (m as any).__emoji = emojiForPlaceType(r.place_type);

          // Apply current zoom sizing immediately
          const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
          const fontSize =
            z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";
          m.setIcon(makeIcon(scale));
          m.setLabel({ text: (m as any).__emoji, fontSize });

          m.addListener("click", () => {
            openPlacePopup(r, m.getPosition());
          });

          placeMarkersRef.current.push(m);
        }
      };

      const schedulePlacesLoad = () => {
        if (placesTimerRef.current) clearTimeout(placesTimerRef.current);
        placesTimerRef.current = setTimeout(() => {
          loadPlacesInView();
        }, 300);
      };

      // Load once at start, then whenever user pans/zooms
      map.addListener("idle", () => {
        scheduleBywaysLoad();
        schedulePlacesLoad();
      });

      // initial load
      scheduleBywaysLoad();
      schedulePlacesLoad();
    };

    script.onerror = () => console.error("Failed to load Google Maps script");
    document.head.appendChild(script);
  }, [stateFilters, typeFilters]); // re-run loading when toggles change

  // --- UI handlers ---
  const toggleState = (st: string) => {
    setStateFilters((prev) => ({ ...prev, [st]: !prev[st] }));
  };

  const toggleType = (t: string) => {
    setTypeFilters((prev) => ({ ...prev, [t]: !prev[t] }));
  };

  return (
    <div style={{ position: "relative" }}>
      <h1 style={{ padding: 10, margin: 0 }}>whereto MVP</h1>

      {/* Control panel overlay */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 10,
          zIndex: 10,
          background: "white",
          padding: "10px 12px",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          fontFamily: "Arial, sans-serif",
          fontSize: 14,
          maxWidth: 240,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Filters</div>

        <div style={{ fontWeight: 700, marginTop: 6 }}>States</div>
        {["NC", "VA", "WV"].map((st) => (
          <label key={st} style={{ display: "block", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={!!stateFilters[st]}
              onChange={() => toggleState(st)}
              style={{ marginRight: 6 }}
            />
            {st}
          </label>
        ))}

        <div style={{ fontWeight: 700, marginTop: 10 }}>Places</div>
        {[
          { key: "birds", label: "Birds 🦅" },
          { key: "hikes", label: "Hikes 🚶" },
          { key: "camps", label: "Camps 🏕️" },
        ].map((t) => (
          <label key={t.key} style={{ display: "block", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={!!typeFilters[t.key]}
              onChange={() => toggleType(t.key)}
              style={{ marginRight: 6 }}
            />
            {t.label}
          </label>
        ))}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tip: pan/zoom reloads byways + places.
        </div>
      </div>

      <div id="map" style={{ height: "80vh", width: "100%" }} />
    </div>
  );
}

// tiny helper to avoid HTML injection from data
function escapeHtml(str: string) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}