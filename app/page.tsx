"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps";

const CAMP_THEMES: Record<string, string> = {
  "SP": "🏞️", "NP": "⛰️", "NF": "🌳", "SF": "🌲", "SFW": "🦆",
  "COE": "💧", "BLM": "🏜️", "MIL": "🎖️", "CP": "⛺", "RES": "⚓", "default": "🏕️"
};

// Define State Groups
const STATE_GROUPS = {
  "South": ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  "East": ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"],
  "Midwest": ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  "West": ["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
  "AK/Canada": [] // Coming Soon
};

const ALL_STATES = Object.values(STATE_GROUPS).flat();

export default function Home() {
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds", "hikes", "camps"]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>(["South"]); // Default South open

  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);
  
  const filtersRef = useRef({
    states: new Set<string>(["NC", "VA", "WV"]),
    types: new Set<PlaceType>(["birds", "hikes", "camps"]),
  });

  useEffect(() => { filtersRef.current.states = new Set(states); }, [states]);
  useEffect(() => { filtersRef.current.types = new Set(placeTypes); }, [placeTypes]);

  const toggleGroupVisibility = (group: string) => {
    setOpenGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  };

  const toggleGroupSelection = (groupStates: string[]) => {
    const allSelected = groupStates.every(st => states.includes(st));
    if (allSelected) {
      setStates(prev => prev.filter(st => !groupStates.includes(st)));
    } else {
      setStates(prev => Array.from(new Set([...prev, ...groupStates])));
    }
  };

  const clearAllStates = () => setStates([]);

  const emojiForType = (t: PlaceType, subtype: string = "") => {
    if (t === "birds") return "🦅";
    if (t === "hikes") return "🥾";
    if (t === "camps") {
      const themeKey = Object.keys(CAMP_THEMES).find(key => 
        (subtype || "").includes(key)
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
    const scale = z <= 5 ? 5 : z <= 7 ? 8 : z <= 10 ? 12 : 16;
    const fontSize = z <= 6 ? "0px" : z <= 8 ? "12px" : "16px";

    placeMarkersRef.current.forEach(m => {
      const type = (m as any).__type as PlaceType;
      const emoji = (m as any).__emoji;
      m.setIcon(makeIcon(google, scale, getColorForType(type)));
      m.setLabel(fontSize === "0px" ? null : { text: emoji, fontSize });
    });
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
      const latVal = r.lat ?? r.latitude;
      const lonVal = r.lon ?? r.longitude;
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
            <b>${r.name || "Unnamed"}</b>
            <div style="font-size:11px; opacity:0.7; margin: 4px 0;">${r.place_type} ${r.subtype ? `• ${r.subtype}` : ""}</div>
            ${r.website ? `<div><a href="${r.website}" target="_blank" style="color: #007bff; text-decoration: none;">View Website</a></div>` : ""}
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
    lastFetchTimerRef.current = setTimeout(loadPlaces, 400); 
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
        width: isFilterOpen ? 200 : 40, padding: isFilterOpen ? 12 : 4,
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)", transition: "width 0.2s"
      }}>
        <button onClick={() => setIsFilterOpen(!isFilterOpen)} style={{ width: "100%", cursor: "pointer", padding: "4px", marginBottom: isFilterOpen ? 8 : 0 }}>
          {isFilterOpen ? "Close Filters" : "☰"}
        </button>

        {isFilterOpen && (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#666", marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}>CATEGORIES</div>
            {(["birds", "hikes", "camps"] as PlaceType[]).map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", marginBottom: 6, cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={placeTypes.includes(t)} 
                  onChange={() => setPlaceTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} 
                />
                <span style={{ marginLeft: 8, textTransform: "capitalize" }}>{t}</span>
              </label>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#666" }}>REGIONS</span>
              <button onClick={clearAllStates} style={{ fontSize: 10, cursor: "pointer", color: "#f44336", background: "none", border: "none", padding: 0, fontWeight: 700 }}>
                CLEAR ALL
              </button>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
              {Object.entries(STATE_GROUPS).map(([groupName, groupStates]) => (
                <div key={groupName} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", background: "#f8f9fa", padding: "4px 6px", borderRadius: 4 }}>
                    <button 
                      onClick={() => toggleGroupVisibility(groupName)} 
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 0, marginRight: 6, fontSize: 10 }}
                    >
                      {openGroups.includes(groupName) ? "▼" : "▶"}
                    </button>
                    <span 
                      onClick={() => groupStates.length > 0 && toggleGroupSelection(groupStates)} 
                      style={{ cursor: groupStates.length > 0 ? "pointer" : "default", flexGrow: 1, fontWeight: 600, fontSize: 12, color: groupStates.length === 0 ? "#999" : "#333" }}
                    >
                      {groupName} {groupStates.length === 0 && <span style={{ fontSize: 9, fontWeight: 400 }}>(Soon)</span>}
                    </span>
                  </div>

                  {openGroups.includes(groupName) && groupStates.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "6px 12px" }}>
                      {groupStates.map((st) => (
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
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div id="map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}