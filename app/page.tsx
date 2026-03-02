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
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds"]); // start with birds only

  // --- refs used by map listeners (avoid stale closures) ---
  const filtersRef = useRef({
    states: new Set<string>(["NC", "VA", "WV"]),
    types: new Set<PlaceType>(["birds"]),
  });

  useEffect(() => {
    filtersRef.current.states = new Set(states);
  }, [states]);

  useEffect(() => {
    filtersRef.current.types = new Set(placeTypes);
  }, [placeTypes]);

  // --- Map refs ---
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);

  // Markers we control (so toggles can hide/show cleanly)
  const placeMarkersRef = useRef<any[]>([]);

  // ---------- marker icon helpers ----------
  const emojiForType = (t: PlaceType) => {
    if (t === "birds") return "🦅";
    if (t === "hikes") return "🚶";
    return "💤";
  };

  const makeIcon = (google: any, scale: number) => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: "#fafbfb",
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: "#f80808",
  });

  const applyMarkerSizing = () => {
    const map = mapRef.current;
    if (!map) return;
    const google = (window as any).google;

    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

    for (const m of placeMarkersRef.current) {
      const emoji = (m as any).__emoji ?? (m.getLabel?.()?.text ?? "•");
      m.setIcon(makeIcon(google, scale));
      m.setLabel({ text: emoji, fontSize });
    }
  };

  // ---------- checkbox helpers ----------
  const toggleState = (st: string) => {
    setStates((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]));
  };

  const togglePlaceType = (t: PlaceType) => {
    setPlaceTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  // ---------- map layer helpers ----------
  const clearByways = () => {
    const map = mapRef.current;
    if (!map) return;
    map.data.forEach((f: any) => map.data.remove(f));
  };

  const clearPlaces = () => {
    for (const m of placeMarkersRef.current) m.setMap(null);
    placeMarkersRef.current = [];
  };

  // ---------- loaders ----------
  const loadBywaysInView = async () => {
    const map = mapRef.current;
    if (!map) return;

    const statesArr = Array.from(filtersRef.current.states);
    if (!statesArr.length) {
      clearByways();
      return;
    }

    const bounds = map.getBounds();
    if (!bounds) return;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const { data, error } = await supabase.rpc("rpc_byways_in_bbox", {
      min_lng: sw.lng(),
      min_lat: sw.lat(),
      max_lng: ne.lng(),
      max_lat: ne.lat(),
      states: statesArr,
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

            // optional nav points if you later add them to the RPC/table
            start_lat: r.start_lat,
            start_lng: r.start_lng,
            mid1_lat: r.mid1_lat,
            mid1_lng: r.mid1_lng,
            mid2_lat: r.mid2_lat,
            mid2_lng: r.mid2_lng,
            end_lat: r.end_lat,
            end_lng: r.end_lng,
          },
        })),
    };

    clearByways();
    map.data.addGeoJson(fc as any);
  };

  const loadPlacesForSelectedFilters = async () => {
    const map = mapRef.current;
    if (!map) return;

    clearPlaces();

    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types);

    if (!statesArr.length || !typesArr.length) {
      return; // nothing selected => nothing shown (and we already cleared markers)
    }

    // NOTE: keep this select list to columns you KNOW exist in Supabase.
    // If you later add nav_lat/nav_lon, add them here then prefer them.
    const { data, error } = await supabase
      .from("places")
      .select("id,name,state,place_type,subtype,website,notes,lat,lon")
      .in("state", statesArr)
      .in("place_type", typesArr);

    if (error) {
      console.error("Places query error:", error);
      return;
    }

    const google = (window as any).google;

    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

    const infoWindow = infoWindowRef.current;

    for (const r of data || []) {
      const lat = r.lat as number | null;
      const lon = r.lon as number | null;
      if (typeof lat !== "number" || typeof lon !== "number") continue;

      const t = r.place_type as PlaceType;

      const marker = new google.maps.Marker({
        position: { lat, lng: lon },
        map,
        title: r.name ?? "",
        icon: makeIcon(google, scale),
        label: { text: emojiForType(t), fontSize },
      });

      // store emoji so zoom resizing keeps the right icon
      (marker as any).__emoji = emojiForType(t);

      marker.addListener("click", () => {
        const name = r.name ?? "(No name)";
        const subtype = r.subtype ? ` • ${r.subtype}` : "";
        const notes = r.notes ? `<div style="margin-top:6px;">${r.notes}</div>` : "";
        const website = r.website
          ? `<div style="margin-top:6px;"><a href="${r.website}" target="_blank" rel="noreferrer">Website</a></div>`
          : "";

        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 260px;">
            <div style="font-weight:700;">${name}</div>
            <div style="opacity:0.85;">${t}${subtype}</div>
            ${website}
            ${notes}
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
    await loadPlacesForSelectedFilters();
    applyMarkerSizing();
  };

  // Debounced refresh for pan/zoom
  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(() => {
      refreshMap();
    }, 250);
  };

  // ---------- initialize map once ----------
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) {
      console.error("Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local");
      return;
    }

    if (document.getElementById("google-maps-script")) return;

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;

    script.onload = () => {
      const google = (window as any).google;

      const map = new google.maps.Map(document.getElementById("map") as HTMLElement, {
        center: { lat: 35.8, lng: -78.6 },
        zoom: 7,
      });

      mapRef.current = map;

      // byways styling
      map.data.setStyle({
        strokeColor: "#5a3e2b",
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });

      const infoWindow = new google.maps.InfoWindow();
      infoWindowRef.current = infoWindow;

      // byway line popup
      map.data.addListener("click", (event: any) => {
        const name = event.feature.getProperty("name") || "(No name)";
        const designats = event.feature.getProperty("designats") || "";

        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 280px;">
            <div style="font-weight:700; margin-bottom:4px;">${name}</div>
            <div>${designats}</div>
          </div>
        `;

        infoWindow.setContent(html);
        infoWindow.setPosition(event.latLng);
        infoWindow.open(map);
      });

      // reload on pan/zoom stop
      map.addListener("idle", scheduleLoad);

      // keep marker sizes matched to zoom
      map.addListener("zoom_changed", () => applyMarkerSizing());

      // initial load
      scheduleLoad();
    };

    script.onerror = () => console.error("Failed to load Google Maps script");
    document.head.appendChild(script);
  }, []);

  // ✅ toggles: update map immediately (no need to pan/zoom)
  useEffect(() => {
    if (!mapRef.current) return;
    refreshMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, placeTypes]);

  return (
    <div style={{ position: "relative" }}>
      <h1 style={{ padding: 10 }}>whereto MVP</h1>

      {/* Filters panel */}
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 60,
          zIndex: 10,
          background: "rgba(255,255,255,0.95)",
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 12,
          width: 220,
          fontFamily: "Arial, sans-serif",
          fontSize: 14,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Filters</div>

        <div style={{ fontWeight: 700, marginTop: 6 }}>States</div>
        {["NC", "VA", "WV"].map((st) => (
          <label key={st} style={{ display: "block", marginTop: 6 }}>
            <input type="checkbox" checked={states.includes(st)} onChange={() => toggleState(st)} />{" "}
            {st}
          </label>
        ))}

        <div style={{ fontWeight: 700, marginTop: 14 }}>Places</div>

        <label style={{ display: "block", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={placeTypes.includes("birds")}
            onChange={() => togglePlaceType("birds")}
          />{" "}
          Birds 🦅
        </label>

        <label style={{ display: "block", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={placeTypes.includes("hikes")}
            onChange={() => togglePlaceType("hikes")}
          />{" "}
          Hikes 🚶
        </label>

        <label style={{ display: "block", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={placeTypes.includes("camps")}
            onChange={() => togglePlaceType("camps")}
          />{" "}
          Camps 🏕️
        </label>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Tip: toggles update immediately; pan/zoom refreshes too.
        </div>
      </div>

      <div id="map" style={{ height: "80vh", width: "100%" }} />
    </div>
  );
}