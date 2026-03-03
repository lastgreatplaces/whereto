"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

// Define the strict type for our place types
type PlaceType = "birds" | "hikes" | "camps";

const CAMP_THEMES: Record<string, string> = {
  "SP": "🏞️", "NP": "⛰️", "NF": "🌳", "SF": "🌲", "SFW": "🦆",
  "COE": "💧", "BLM": "🏜️", "MIL": "🎖️", "CP": "⛺", "RES": "⚓", "default": "🏕️"
};

const ALL_STATES = [
  "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function Home() {
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds", "hikes", "camps"]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);
  
  // Ref to track current filters for the map listeners without triggering re-renders
  const filtersRef = useRef({
    states: new Set<string>(["NC", "VA", "WV"]),
    types: new Set<PlaceType>(["birds", "hikes", "camps"]),
  });

  useEffect(() => { filtersRef.current.states = new Set(states); }, [states]);
  useEffect(() => { filtersRef.current.types = new Set(placeTypes); }, [placeTypes]);

  const toggleAllStates = () => {
    setStates(prev => prev.length === ALL_STATES.length ? [] : [...ALL_STATES]);
  };

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
    const z = map.getZoom() ?? 4;
    
    // Performance: aggressive scaling for large datasets
    const scale = z <= 5 ? 5 : z <= 7 ? 8 : z <= 10 ? 12 : 16;
    const fontSize = z <= 6 ? "0px" : z <= 8 ? "12px" : "16px";

    placeMarkersRef.current.forEach(m => {
      const type = (m as any).__type as PlaceType;
      const emoji = (m as any).__emoji;
      m.setIcon(makeIcon(google, scale, getColorForType(type)));
      m.setLabel(fontSize === "0px" ? null : { text: emoji, fontSize });
    });
  };

  const loadBywaysInView = async () => {
    const map = mapRef.current;
    if (!map) return;
    const statesArr = Array.from(filtersRef.current.states);
    const bounds = map.getBounds();
    if (!bounds || !statesArr.length) {
      map.data.forEach((f: any) => map.data.remove(f));
      return;
    }

    const { data, error } = await supabase.rpc("rpc_byways_in_bbox", {
      min_lng: bounds.getSouthWest().lng(), min_lat: bounds.getSouthWest().lat(),
      max_lng: bounds.getNorthEast().lng(), max_lat: bounds.getNorthEast().lat(),
      states: statesArr,
    });

    if (error) return;

    const fc = {
      type: "FeatureCollection",
      features: (data || []).filter((r: any) => r.geom_geojson).map((r: any) => ({
        type: "Feature",
        geometry: r.geom_geojson,
        properties: { name: r.name, designats: r.designats }
      })),
    };

    map.data.forEach((f: any) => map.data.remove(f));
    map.data.addGeoJson(fc as any);
  };

  const loadPlaces = async () => {
    const map = mapRef.current;
    if (!map) return;
    
    placeMarkersRef.current.forEach(m => m.setMap(null));
    placeMarkersRef.current = [];

    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types);
    if (!statesArr.length || !typesArr.length) return;

    const { data, error } = await supabase
      .from("places")
      .select("*")
      .in("state", statesArr)
      .in("place_type", typesArr);

    if (error) return;

    const google = (window as any).google;
    (data || []).forEach(r => {
      // Use logical ORs to catch both your cleaned and original names
      const latVal = r.lat ?? r.latitude;
      const lonVal = r.lon ?? r.longitude;
      const nameVal = r.name ?? r.iba_name;

      if (latVal === null || lonVal === null) return;

      const marker = new google.maps.Marker({
        position: { lat: Number(latVal), lng: Number(lonVal) },
        map,
        optimized: true,
      });

      (marker as any).__type = r.place_type;
      (marker as any).__emoji = emojiForType(r.place_type as PlaceType, r.subtype);

      marker.addListener("click", () => {
        infoWindowRef.current.setContent(`
          <div style="font-family: Arial; font-size: 14px; min-width: 150px;">
            <b>${nameVal || "Unnamed"}</b>
            <div style="font-size:12px; opacity:0.7; margin: 4px 0;">${r.place_type} ${r.subtype ? `• ${r.subtype}` : ""}</div>
            ${r.website ? `<div><a href="${r.website}" target="_blank" style="color: #007bff; text-decoration: none;">View Source</a></div>` : ""}
          </div>`);
        infoWindowRef.current.setPosition(marker.getPosition());
        infoWindowRef.current.open(map);
      });
      placeMarkersRef.current.push(marker);
    });
    applyMarkerSizing();
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(async () => {
      await loadBywaysInView();
      await loadPlaces();
    }, 400); 
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || document.getElementById("gmap-script")) return;
    const script = document.createElement("script");
    script.id = "gmap-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.onload = () => {
      const google = (window as any).google;
      const map = new google.maps.Map(document.getElementById("map") as HTMLElement, { 
        center: { lat: 38.5, lng: -96.5 }, 
        zoom: 4,
        maxZoom: 18,
        minZoom: 3,
        mapTypeControl: false,
        streetViewControl: false
      });
      mapRef.current = map;
      map.data.setStyle({ strokeColor: "#5a3e2b", strokeWeight: 2 });
      infoWindowRef.current = new google.maps.InfoWindow();
      
      map.addListener("idle", scheduleLoad);
      map.addListener("zoom_changed", applyMarkerSizing);
      scheduleLoad();
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => { if (mapRef.current) scheduleLoad(); }, [states, placeTypes]);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{
        position: "absolute", left: 12, top: 12, zIndex: 10,
        background: "white", border: "1px solid #ccc", borderRadius: 8,
        width: isFilterOpen ? 180 : 40, padding: isFilterOpen ? 12 : 4,
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)", transition: "width 0.2s"
      }}>
        <button onClick={() => setIsFilterOpen(!isFilterOpen)} style={{ width: "100%", cursor: "pointer", padding: "4px" }}>
          {isFilterOpen ? "Close Filters" : "☰"}
        </button>

        {isFilterOpen && (
          <div style={{ fontSize: 13, marginTop: 10 }}>
            <div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>CATEGORIES</div>
            {(["birds", "hikes", "camps"] as PlaceType[]).map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", marginBottom: 6, cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={placeTypes.includes(t)} 
                  onChange={() => {
                    setPlaceTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
                  }} 
                />
                <span style={{ marginLeft: 8, textTransform: "capitalize" }}>{t}</span>
              </label>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: "#666" }}>STATES</span>
              <button onClick={toggleAllStates} style={{ fontSize: 11, cursor: "pointer", color: "#007bff", background: "none", border: "none", padding: 0, textDecoration: "underline" }}>
                {states.length === ALL_STATES.length ? "Clear" : "All"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", maxHeight: "250px", overflowY: "auto", paddingRight: "4px" }}>
              {ALL_STATES.map((st) => (
                <label key={st} style={{ display: "flex", alignItems: "center", fontSize: 11, cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={states.includes(st)} 
                    onChange={() => setStates(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])} 
                  />
                  <span style={{ marginLeft: 4 }}>{st}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <div id="map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}