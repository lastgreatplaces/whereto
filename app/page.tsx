"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps";

export default function Home() {
  // --- UI state ---
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds"]);

  // --- Map refs ---
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);

  // Icon Generator
  const makeIcon = (google: any, scale: number) => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: "#fafbfb",
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: "#f80808",
    labelOrigin: new google.maps.Point(0, 0),
  });

  const emojiForType = (t: PlaceType) => {
    if (t === "birds") return "🦅";
    if (t === "hikes") return "🚶";
    return "🏕️";
  };

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

  // --- Data Loading ---
  const clearByways = () => {
    if (mapRef.current) {
      mapRef.current.data.forEach((f: any) => mapRef.current.data.remove(f));
    }
  };

  const clearPlaces = () => {
    placeMarkersRef.current.forEach((m) => m.setMap(null));
    placeMarkersRef.current = [];
  };

  const loadBywaysInView = async () => {
    const map = mapRef.current;
    if (!map || !map.getBounds() || states.length === 0) {
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

    if (error) return;

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
    
    // CRITICAL: Ensure map and google are ready
    if (!map || !google || !infoWindowRef.current) return;

    clearPlaces();

    if (states.length === 0 || placeTypes.length === 0) return;

    const { data, error } = await supabase
      .from("places")
      .select("id,name,state,place_type,subtype,website,notes,lat,lon,nav_lat,nav_lon")
      .in("state", states)
      .in("place_type", placeTypes);

    if (error) {
      console.error("Fetch error:", error);
      return;
    }

    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

    data?.forEach((r: any) => {
      const lat = r.nav_lat ?? r.lat;
      const lon = r.nav_lon ?? r.lon;
      if (typeof lat !== "number" || typeof lon !== "number") return;

      const marker = new google.maps.Marker({
        position: { lat, lng: lon },
        map: map,
        title: r.name,
        icon: makeIcon(google, scale),
        label: {
          text: emojiForType(r.place_type as PlaceType),
          fontSize,
          fontWeight: "bold"
        },
        zIndex: 999 // Ensure icons are above the byway lines
      });

      marker.addListener("click", () => {
        const html = `
          <div style="font-family:sans-serif; padding:5px; max-width:200px;">
            <div style="font-weight:700;">${r.name}</div>
            <div style="font-size:12px; color:#666;">${r.place_type} ${r.subtype ? `• ${r.subtype}` : ""}</div>
            ${r.website ? `<a href="${r.website}" target="_blank" style="display:block;margin-top:5px;color:blue;">Website</a>` : ""}
          </div>
        `;
        infoWindowRef.current.setContent(html);
        infoWindowRef.current.setPosition(marker.getPosition());
        infoWindowRef.current.open(map);
      });

      placeMarkersRef.current.push(marker);
    });
  };

  const refreshMap = () => {
    loadBywaysInView();
    loadPlacesInView();
  };

  // 1. Initial Map Setup
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || document.getElementById("google-maps-script")) return;

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.onload = () => {
      const google = (window as any).google;
      const map = new google.maps.Map(document.getElementById("map") as HTMLElement, {
        center: { lat: 37.5, lng: -80.0 },
        zoom: 7,
      });

      mapRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();

      map.data.setStyle({
        strokeColor: "#5a3e2b",
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });

      // Initial load once the map settles
      map.addListener("idle", () => {
        if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
        lastFetchTimerRef.current = setTimeout(refreshMap, 300);
      });
    };
    document.head.appendChild(script);
  }, []);

  // 2. React to State/Toggle changes
  useEffect(() => {
    // Only refresh if the map is actually initialized
    if (mapRef.current && (window as any).google) {
      refreshMap();
    }
  }, [states, placeTypes]);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%" }}>
      {/* Overlay Filter UI */}
      <div style={{
        position: "absolute", left: 15, top: 15, zIndex: 10,
        background: "rgba(255,255,255,0.98)", padding: "15px", borderRadius: "12px",
        width: "200px", boxShadow: "0 4px 15px rgba(0,0,0,0.15)", fontFamily: "sans-serif"
      }}>
        <div style={{ fontWeight: 700, marginBottom: "12px", borderBottom: "1px solid #eee", paddingBottom: "5px" }}>Filters</div>
        
        <div style={{ marginBottom: "15px" }}>
          <div style={{ fontSize: "11px", color: "#999", fontWeight: 700, marginBottom: "5px" }}>STATES</div>
          {["NC", "VA", "WV"].map(st => (
            <label key={st} style={{ display: "flex", alignItems: "center", marginBottom: "5px", cursor: "pointer" }}>
              <input type="checkbox" checked={states.includes(st)} onChange={() => toggleState(st)} style={{ marginRight: "8px" }} />
              {st}
            </label>
          ))}
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#999", fontWeight: 700, marginBottom: "5px" }}>PLACES</div>
          {(["birds", "hikes", "camps"] as PlaceType[]).map(pt => (
            <label key={pt} style={{ display: "flex", alignItems: "center", marginBottom: "5px", cursor: "pointer", textTransform: "capitalize" }}>
              <input type="checkbox" checked={placeTypes.includes(pt)} onChange={() => togglePlaceType(pt)} style={{ marginRight: "8px" }} />
              {pt} {emojiForType(pt)}
            </label>
          ))}
        </div>
      </div>

      <div id="map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}