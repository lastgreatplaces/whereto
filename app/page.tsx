"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps";

export default function Home() {
  // --- UI state (toggles) ---
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds"]);

  // --- Map refs ---
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);

  // Markers we control
  const placeMarkersRef = useRef<any[]>([]);

  // Simple “emoji in red circle” icon
  const makeIcon = (google: any, scale: number) => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: "#fafbfb",
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: "#f80808",
  });

  const emojiForType = (t: PlaceType) => {
    if (t === "birds") return "🦅";
    if (t === "hikes") return "🚶";
    return "🏕️";
  };

  // --- checkbox helpers ---
  const toggleState = (st: string) => {
    setStates((prev) =>
      prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
    );
  };

  const togglePlaceType = (t: PlaceType) => {
    setPlaceTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  // --- Map data helpers ---
  const clearByways = () => {
    const map = mapRef.current;
    if (!map) return;
    map.data.forEach((f: any) => map.data.remove(f));
  };

  const clearPlaces = () => {
    for (const m of placeMarkersRef.current) m.setMap(null);
    placeMarkersRef.current = [];
  };

  const loadBywaysInView = async () => {
    const map = mapRef.current;
    if (!map || !map.getBounds()) return;

    if (!states.length) {
      clearByways();
      return;
    }

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const { data, error } = await supabase.rpc("rpc_byways_in_bbox", {
      min_lng: sw.lng(),
      min_lat: sw.lat(),
      max_lng: ne.lng(),
      max_lat: ne.lat(),
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
          properties: { ...r },
        })),
    };

    clearByways();
    map.data.addGeoJson(fc as any);
  };

  const loadPlacesInView = async () => {
    const map = mapRef.current;
    const google = (window as any).google;
    if (!map || !google) return;

    clearPlaces();

    if (!states.length || !placeTypes.length) return;

    const { data, error } = await supabase
      .from("places")
      .select("id,name,state,place_type,subtype,website,notes,lat,lon,nav_lat,nav_lon")
      .in("state", states)
      .in("place_type", placeTypes);

    if (error) {
      console.error("Places query error:", error);
      return;
    }

    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";
    const infoWindow = infoWindowRef.current;

    for (const r of data || []) {
      const lat = (r.nav_lat ?? r.lat) as number | null;
      const lon = (r.nav_lon ?? r.lon) as number | null;
      if (typeof lat !== "number" || typeof lon !== "number") continue;

      const t = r.place_type as PlaceType;
      const marker = new google.maps.Marker({
        position: { lat, lng: lon },
        map,
        title: r.name ?? "",
        icon: makeIcon(google, scale),
        label: { text: emojiForType(t), fontSize },
      });

      marker.addListener("click", () => {
        const name = r.name ?? "(No name)";
        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 260px;">
            <div style="font-weight:700;">${name}</div>
            <div style="opacity:0.85;">${t}${r.subtype ? ` • ${r.subtype}` : ""}</div>
            ${r.website ? `<div style="margin-top:6px;"><a href="${r.website}" target="_blank">Website</a></div>` : ""}
            ${r.notes ? `<div style="margin-top:6px;">${r.notes}</div>` : ""}
          </div>
        `;
        infoWindow.setContent(html);
        infoWindow.setPosition(marker.getPosition());
        infoWindow.open(map);
      });

      placeMarkersRef.current.push(marker);
    }
  };

  const refreshMap = async () => {
    await loadBywaysInView();
    await loadPlacesInView();
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(() => refreshMap(), 250);
  };

  // 1. Initial Script and Map Load
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || document.getElementById("google-maps-script")) return;

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.onload = () => {
      const google = (window as any).google;
      const map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 35.8, lng: -78.6 },
        zoom: 7,
      });

      mapRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();

      map.data.setStyle({
        strokeColor: "#5a3e2b",
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });

      map.addListener("idle", scheduleLoad);
      
      // Force an initial refresh once the map is ready
      google.maps.event.addListenerOnce(map, 'tilesloaded', refreshMap);
    };
    document.head.appendChild(script);
  }, []);

  // 2. React to Toggle Changes
  useEffect(() => {
    if (mapRef.current && (window as any).google) {
      refreshMap();
    }
  }, [states, placeTypes]);

  return (
    <div style={{ position: "relative" }}>
      <h1 style={{ padding: 10, fontFamily: "sans-serif" }}>whereto MVP</h1>

      <div
        style={{
          position: "absolute",
          left: 12,
          top: 70,
          zIndex: 10,
          background: "rgba(255,255,255,0.95)",
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 12,
          width: 200,
          fontFamily: "Arial, sans-serif",
          boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Filters</div>

        <div style={{ fontWeight: 700, marginTop: 10 }}>States</div>
        {["NC", "VA", "WV"].map((st) => (
          <label key={st} style={{ display: "block", marginTop: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={states.includes(st)}
              onChange={() => toggleState(st)}
            /> {st}
          </label>
        ))}

        <div style={{ fontWeight: 700, marginTop: 14 }}>Places</div>
        {(["birds", "hikes", "camps"] as PlaceType[]).map((type) => (
          <label key={type} style={{ display: "block", marginTop: 4, cursor: "pointer", textTransform: "capitalize" }}>
            <input
              type="checkbox"
              checked={placeTypes.includes(type)}
              onChange={() => togglePlaceType(type)}
            /> {type} {emojiForType(type)}
          </label>
        ))}

        <div style={{ marginTop: 12, fontSize: 11, opacity: 0.6 }}>
          Tip: pan/zoom reloads data.
        </div>
      </div>

      <div id="map" style={{ height: "90vh", width: "100%" }} />
    </div>
  );
}