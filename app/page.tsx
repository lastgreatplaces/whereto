"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps";

// --- CUSTOMIZE YOUR CAMP ICONS HERE ---
const CAMP_THEMES: Record<string, string> = {
  "SP": "🏞️",    // State Park
  "NP": "⛰️",    // National Park
  "NF": "🌳",    // National Forest
  "SF": "🌲",    // State Forest
  "SFW": "🦆",   // State Fish & Wildlife
  "COE": "💧",   // Army Corps of Engineers
  "BLM": "🏜️",   // Bureau of Land Management
  "MIL": "🎖️",   // Military / FamCamps
  "CP": "⛺",    // County/City Park
  "RES": "⚓",   // Reservation/Other
  "default": "🏕️"
};

export default function Home() {
  // --- UI state ---
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds"]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  // --- refs ---
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

  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);

  // ---------- marker icon helpers ----------
  
  const emojiForType = (t: PlaceType, subtype: string = "") => {
    if (t === "birds") return "🦅";
    if (t === "hikes") return "🥾";
    if (t === "camps") {
      const cleanSub = (subtype || "").trim();
      const themeKey = Object.keys(CAMP_THEMES).find(key => 
        cleanSub === key || cleanSub.split(' ').includes(key)
      );
      return themeKey ? CAMP_THEMES[themeKey] : CAMP_THEMES["default"];
    }
    return "📍";
  };

  const getColorForType = (t: PlaceType) => {
    if (t === "birds") return "#f80808"; 
    if (t === "camps") return "#007bff"; 
    if (t === "hikes") return "#28a745"; 
    return "#666666";
  };

  const makeIcon = (google: any, scale: number, color: string) => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: "#fafbfb",
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: color,
  });

  const applyMarkerSizing = () => {
    const map = mapRef.current;
    if (!map) return;
    const google = (window as any).google;
    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

    for (const m of placeMarkersRef.current) {
      const emoji = (m as any).__emoji ?? "•";
      const type = (m as any).__type as PlaceType;
      m.setIcon(makeIcon(google, scale, getColorForType(type)));
      m.setLabel({ text: emoji, fontSize });
    }
  };

  const toggleState = (st: string) => {
    setStates((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]));
  };

  const togglePlaceType = (t: PlaceType) => {
    setPlaceTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

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
    if (!map) return;
    const statesArr = Array.from(filtersRef.current.states);
    if (!statesArr.length) { clearByways(); return; }

    const bounds = map.getBounds();
    if (!bounds) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const { data, error } = await supabase.rpc("rpc_byways_in_bbox", {
      min_lng: sw.lng(), min_lat: sw.lat(),
      max_lng: ne.lng(), max_lat: ne.lat(),
      states: statesArr,
    });

    if (error) return console.error(error);

    const fc = {
      type: "FeatureCollection",
      features: (data || []).filter((r: any) => r.geom_geojson).map((r: any) => ({
        type: "Feature",
        geometry: r.geom_geojson,
        properties: { name: r.name, designats: r.designats }
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
    if (!statesArr.length || !typesArr.length) return;

    // We select * to ensure we get camp_open, camp_sites, hike_distance, etc.
    const { data, error } = await supabase
      .from("places")
      .select("*")
      .in("state", statesArr)
      .in("place_type", typesArr);

    if (error) return console.error(error);

    const google = (window as any).google;
    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

    for (const r of data || []) {
      if (typeof r.lat !== "number" || typeof r.lon !== "number") continue;

      const t = r.place_type as PlaceType;
      const emoji = emojiForType(t, r.subtype);
      const color = getColorForType(t);

      const marker = new google.maps.Marker({
        position: { lat: r.lat, lng: r.lon },
        map,
        title: r.name ?? "",
        icon: makeIcon(google, scale, color),
        label: { text: emoji, fontSize },
      });

      (marker as any).__emoji = emoji;
      (marker as any).__type = t;

      marker.addListener("click", () => {
        const name = r.name ?? "(No name)";
        const subtype = r.subtype ? ` • ${r.subtype}` : "";

        // Build extra info section instantly from data already in 'r'
        let extraHtml = "";
        if (t === "camps") {
          if (r.camp_open || r.camp_sites || r.camp_elevation) {
            extraHtml = `
              <div style="margin-top:8px; padding-top:8px; border-top:1px solid #eee; font-size:12px; line-height:1.4;">
                ${r.camp_open ? `<div><b>Open:</b> ${r.camp_open}</div>` : ""}
                ${r.camp_sites ? `<div><b>Sites:</b> ${r.camp_sites}</div>` : ""}
                ${r.camp_elevation ? `<div><b>Elevation:</b> ${r.camp_elevation}ft</div>` : ""}
              </div>
            `;
          }
        } else if (t === "hikes") {
          if (r.hike_distance || r.hike_difficulty) {
            extraHtml = `
              <div style="margin-top:8px; padding-top:8px; border-top:1px solid #eee; font-size:12px; line-height:1.4;">
                ${r.hike_distance ? `<div><b>Distance:</b> ${r.hike_distance}</div>` : ""}
                ${r.hike_difficulty ? `<div><b>Difficulty:</b> ${r.hike_difficulty}</div>` : ""}
              </div>
            `;
          }
        }
        
        const html = `
          <div style="font-family: Arial; font-size: 14px; max-width: 240px; min-width: 180px;">
            <div style="font-weight:700;">${name}</div>
            <div style="opacity:0.85; margin-bottom: 6px;">${t}${subtype}</div>
            ${extraHtml}
            ${r.website ? `<div style="margin-top:10px;"><a href="${r.website}" target="_blank">Website</a></div>` : ""}
          </div>
        `;
        
        infoWindowRef.current.setContent(html);
        infoWindowRef.current.setPosition(marker.getPosition());
        infoWindowRef.current.open(map);
      });

      placeMarkersRef.current.push(marker);
    }
  };

  const refreshMap = async () => {
    await loadBywaysInView();
    await loadPlacesForSelectedFilters();
    applyMarkerSizing();
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(refreshMap, 250);
  };

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
        center: { lat: 35.8, lng: -78.6 },
        zoom: 7,
      });
      mapRef.current = map;
      map.data.setStyle({ strokeColor: "#5a3e2b", strokeWeight: 3 });
      infoWindowRef.current = new google.maps.InfoWindow();
      map.addListener("idle", scheduleLoad);
      map.addListener("zoom_changed", () => applyMarkerSizing());
      scheduleLoad();
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (mapRef.current) refreshMap();
  }, [states, placeTypes]);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", left: 12, top: 12, zIndex: 10,
          background: "rgba(255,255,255,0.98)", border: "1px solid #ccc",
          borderRadius: 12, padding: isFilterOpen ? 16 : 8,
          width: isFilterOpen ? 220 : "auto", fontFamily: "Arial, sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", transition: "all 0.2s ease"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isFilterOpen ? 12 : 0 }}>
          {isFilterOpen && <span style={{ fontWeight: 800 }}>Filters</span>}
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            style={{ background: "#eee", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}
          >
            {isFilterOpen ? "Hide" : "Menu ☰"}
          </button>
        </div>
        {isFilterOpen && (
          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#666", textTransform: "uppercase" }}>States</div>
            {["NC", "VA", "WV"].map((st) => (
              <label key={st} style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                <input type="checkbox" checked={states.includes(st)} onChange={() => toggleState(st)} style={{ marginRight: 8 }} /> {st}
              </label>
            ))}
            <div style={{ fontWeight: 700, fontSize: 11, color: "#666", textTransform: "uppercase", marginTop: 16 }}>Places</div>
            <label style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={placeTypes.includes("birds")} onChange={() => togglePlaceType("birds")} style={{ marginRight: 8 }} />
              Birds <span style={{ marginLeft: "auto" }}>🦅</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={placeTypes.includes("hikes")} onChange={() => togglePlaceType("hikes")} style={{ marginRight: 8 }} />
              Hikes <span style={{ marginLeft: "auto" }}>🥾</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={placeTypes.includes("camps")} onChange={() => togglePlaceType("camps")} style={{ marginRight: 8 }} />
              Camps <span style={{ marginLeft: "auto" }}>🏕️</span>
            </label>
          </div>
        )}
      </div>
      <div id="map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}