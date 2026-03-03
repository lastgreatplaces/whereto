"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps" | "highways";

interface Theme {
  color: string;
  emoji: string;
}

const CAMP_THEMES: Record<string, Theme> = {
  "COE": { color: "#d32f2f", emoji: "⚓" },     
  "NF": { color: "#1b5e20", emoji: "🌲" },      
  "NP": { color: "#5d4037", emoji: "⛰️" },      
  "SP": { color: "#1976d2", emoji: "🏞️" },      
  "SF": { color: "#388e3c", emoji: "🌳" },      
  "BLM": { color: "#fbc02d", emoji: "🏜️" },     
  "MIL": { color: "#7b1fa2", emoji: "🎖️" },     
  "CP": { color: "#00acc1", emoji: "🏙️" },      
  "default": { color: "#607d8b", emoji: "⛺" }  
};

const CAMP_SUBTYPE_LABELS: Record<string, string> = {
  "COE": "Army Corps",
  "NF": "Nat. Forest",
  "NP": "Nat. Park",
  "SP": "State Park",
  "SF": "State Forest",
  "BLM": "BLM",
  "MIL": "Military",
  "CP": "Local Park",
  "SFW": "Fish/Wild",
  "RES": "Other/Res"
};

const ALL_CAMP_SUBTYPES = Object.keys(CAMP_SUBTYPE_LABELS);

const STATE_GROUPS: Record<string, string[]> = {
  "South": ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  "East": ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"],
  "Midwest": ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  "West": ["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
  "AK/Canada": [] 
};

export default function Home() {
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds", "hikes", "camps", "highways"]);
  const [selectedCampSubtypes, setSelectedCampSubtypes] = useState<string[]>([...ALL_CAMP_SUBTYPES]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>(["South"]);
  const [isCampSubmenuOpen, setIsCampSubmenuOpen] = useState(false);

  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);
  const highwayLinesRef = useRef<any[]>([]);
  
  const filtersRef = useRef({
    states: new Set<string>(["NC", "VA", "WV"]),
    types: new Set<PlaceType>(["birds", "hikes", "camps", "highways"]),
    campSubtypes: new Set<string>([...ALL_CAMP_SUBTYPES])
  });

  useEffect(() => { 
    filtersRef.current.states = new Set(states); 
    filtersRef.current.types = new Set(placeTypes);
    filtersRef.current.campSubtypes = new Set(selectedCampSubtypes);
  }, [states, placeTypes, selectedCampSubtypes]);

  const getCampTheme = (subtype: string): Theme => {
    const sub = subtype || "";
    const key = Object.keys(CAMP_THEMES).find(k => sub.includes(k));
    return key ? CAMP_THEMES[key] : CAMP_THEMES["default"];
  };

  const getMarkerStyle = (google: any, type: PlaceType, subtype: string, zoom: number) => {
    // Base scale based on zoom level
    const baseSize = zoom <= 7 ? 24 : zoom <= 10 ? 34 : 44;
    
    if (type === "birds") {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: baseSize / 2.2, // Larger bird icon
        fillColor: "#f80808",
        fillOpacity: 1,
        strokeWeight: 3, // Thick white border for the "red circle with white background" look
        strokeColor: "#ffffff"
      };
    }
    
    if (type === "hikes") {
      return {
        path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z", 
        scale: baseSize / 20,
        fillColor: "#28a745",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#ffffff"
      };
    }

    if (type === "camps") {
      const theme = getCampTheme(subtype);
      return {
        // Teardrop path anchored at (0,0)
        path: "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1 1 10,-30 C 10,-22 2,-20 0,0 z", 
        scale: baseSize / 18, // Slightly larger teardrops
        fillColor: theme.color,
        fillOpacity: 1,
        strokeWeight: 1.5,
        strokeColor: "#ffffff",
        labelOrigin: new google.maps.Point(0, -30)
      };
    }

    return google.maps.SymbolPath.CIRCLE;
  };

  const applyMarkerSizing = () => {
    const map = mapRef.current;
    if (!map) return;
    const google = (window as any).google;
    const z = map.getZoom() ?? 7;
    // Labels only show when zoomed in enough to see details
    const fontSize = z <= 8 ? "0px" : z <= 11 ? "12px" : "15px";

    placeMarkersRef.current.forEach(m => {
      const type = (m as any).__type as PlaceType;
      const subtype = (m as any).__subtype || "";
      const emoji = (m as any).__emoji;
      
      m.setIcon(getMarkerStyle(google, type, subtype, z));
      m.setLabel(fontSize === "0px" ? null : { 
        text: emoji, 
        fontSize,
        color: "white",
        fontWeight: "700"
      });
    });
  };

  const loadHighways = async () => {
    highwayLinesRef.current.forEach(line => line.setMap(null));
    highwayLinesRef.current = [];

    if (!filtersRef.current.types.has("highways")) return;

    // Fetching from the highways table
    const { data, error } = await supabase
      .from("highways")
      .select("*")
      .in("state", Array.from(filtersRef.current.states));

    if (error || !data) return;

    const google = (window as any).google;
    data.forEach(h => {
      // Logic to handle path as a string or array
      const rawPath = typeof h.path === 'string' ? JSON.parse(h.path) : h.path;
      if (!rawPath || !Array.isArray(rawPath)) return;

      const poly = new google.maps.Polyline({
        path: rawPath, 
        geodesic: true,
        strokeColor: "#4e342e", // Dark brown
        strokeOpacity: 0.8,
        strokeWeight: 3.5,
        map: mapRef.current
      });
      highwayLinesRef.current.push(poly);
    });
  };

  const loadPlaces = async () => {
    const map = mapRef.current;
    if (!map || !clustererRef.current) return;
    clustererRef.current.clearMarkers();
    placeMarkersRef.current = [];

    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types).filter(t => t !== "highways");
    
    // Call highway loader
    loadHighways();

    if (!statesArr.length || !typesArr.length) return;

    const { data, error } = await supabase.from("places").select("*").in("state", statesArr).in("place_type", typesArr);
    if (error) return;

    const google = (window as any).google;
    const newMarkers = (data || [])
      .filter(r => {
        if (r.place_type === "camps") {
          return Array.from(filtersRef.current.campSubtypes).some(sub => (r.subtype || "").includes(sub));
        }
        return true;
      })
      .map(r => {
        const latVal = r.lat ?? r.latitude;
        const lonVal = r.lon ?? r.longitude;
        if (latVal === null || lonVal === null) return null;
        
        const marker = new google.maps.Marker({ position: { lat: Number(latVal), lng: Number(lonVal) }, optimized: true });
        const t = r.place_type as PlaceType;
        const sub = r.subtype || "";
        const theme = getCampTheme(sub);

        (marker as any).__type = t;
        (marker as any).__subtype = sub;
        (marker as any).__emoji = t === "birds" ? "🦅" : t === "hikes" ? "🥾" : theme.emoji;

        marker.addListener("click", () => {
          infoWindowRef.current.setContent(`<div style="font-family: Arial; padding: 5px;"><b>${r.name}</b><br/><small>${r.subtype || ""}</small></div>`);
          infoWindowRef.current.setPosition(marker.getPosition());
          infoWindowRef.current.open(map);
        });
        return marker;
      }).filter(m => m !== null);

    placeMarkersRef.current = newMarkers as any[];
    clustererRef.current.addMarkers(placeMarkersRef.current);
    applyMarkerSizing();
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(async () => {
      await loadPlaces();
    }, 400); 
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    const clusterScript = document.createElement("script");
    clusterScript.src = "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";

    script.onload = () => {
      document.head.appendChild(clusterScript);
      clusterScript.onload = () => {
        const google = (window as any).google;
        const MarkerClusterer = (window as any).markerClusterer.MarkerClusterer;
        const map = new google.maps.Map(document.getElementById("map") as HTMLElement, { 
          center: { lat: 35.8, lng: -78.6 }, zoom: 7, maxZoom: 18, minZoom: 3, mapTypeControl: false, streetViewControl: false
        });
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        
        clustererRef.current = new MarkerClusterer({ 
          map, 
          algorithmOptions: { maxZoom: 9, gridSize: 60 } 
        });

        map.addListener("idle", scheduleLoad);
        map.addListener("zoom_changed", applyMarkerSizing);
      };
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => { if (mapRef.current) scheduleLoad(); }, [states, placeTypes, selectedCampSubtypes]);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{
        position: "absolute", left: 12, top: 12, zIndex: 10, background: "white", border: "1px solid #ccc", borderRadius: 8,
        width: isFilterOpen ? 220 : 40, padding: isFilterOpen ? 12 : 4, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", transition: "width 0.2s"
      }}>
        <button onClick={() => setIsFilterOpen(!isFilterOpen)} style={{ width: "100%", cursor: "pointer", padding: "4px", marginBottom: isFilterOpen ? 8 : 0 }}>{isFilterOpen ? "Close Filters" : "☰"}</button>
        {isFilterOpen && (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#666", marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}>CATEGORIES</div>
            {(["birds", "hikes", "camps", "highways"] as PlaceType[]).map((t) => (
              <div key={t}>
                <label style={{ display: "flex", alignItems: "center", marginBottom: 6, cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={placeTypes.includes(t)} 
                    onChange={() => setPlaceTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} 
                  />
                  <span style={{ marginLeft: 8, textTransform: "capitalize", flexGrow: 1 }}>{t}</span>
                  {t === "camps" && (
                    <button onClick={(e) => { e.preventDefault(); setIsCampSubmenuOpen(!isCampSubmenuOpen); }} style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer" }}>
                      {isCampSubmenuOpen ? "▲" : "▼"}
                    </button>
                  )}
                </label>
                {t === "camps" && isCampSubmenuOpen && (
                  <div style={{ paddingLeft: 10, marginBottom: 10, display: "grid", gridTemplateColumns: "1fr", gap: "2px", background: "#f9f9f9", padding: "6px", borderRadius: "4px" }}>
                    {ALL_CAMP_SUBTYPES.map(sub => (
                      <label key={sub} style={{ fontSize: 11, display: "flex", alignItems: "center", cursor: "pointer" }}>
                        <input type="checkbox" checked={selectedCampSubtypes.includes(sub)} onChange={() => setSelectedCampSubtypes(prev => prev.includes(sub) ? prev.filter(x => x !== sub) : [...prev, sub])} />
                        <span style={{ marginLeft: 6, color: CAMP_THEMES[sub]?.color || "#333", fontWeight: 600 }}>{CAMP_SUBTYPE_LABELS[sub] || sub}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#666" }}>REGIONS</span>
              <button onClick={() => setStates([])} style={{ fontSize: 9, cursor: "pointer", color: "#f44336", background: "none", border: "none", padding: 0, fontWeight: 700 }}>CLEAR</button>
            </div>
            <div style={{ maxHeight: "45vh", overflowY: "auto", paddingRight: "4px" }}>
              {Object.entries(STATE_GROUPS).map(([groupName, groupStates]) => {
                const groupSelected = groupStates.length > 0 && groupStates.every(st => states.includes(st));
                return (
                  <div key={groupName} style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", background: "#f8f9fa", padding: "4px 6px", borderRadius: 4 }}>
                      <button onClick={() => setOpenGroups(prev => prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName])} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, marginRight: 6, fontSize: 10 }}>
                        {openGroups.includes(groupName) ? "▼" : "▶"}
                      </button>
                      <span style={{ flexGrow: 1, fontWeight: 600, fontSize: 11 }}>{groupName}</span>
                      {groupStates.length > 0 && (
                        <button onClick={() => {
                          setStates(prev => groupSelected ? prev.filter(st => !groupStates.includes(st)) : Array.from(new Set([...prev, ...groupStates])));
                        }} style={{ fontSize: 9, cursor: "pointer", color: "#007bff", background: "#e7f1ff", border: "none", padding: "2px 4px", borderRadius: 3, fontWeight: 700 }}>
                          {groupSelected ? "NONE" : "ALL"}
                        </button>
                      )}
                    </div>
                    {openGroups.includes(groupName) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "6px 12px" }}>
                        {groupStates.map((st) => (
                          <label key={st} style={{ display: "flex", alignItems: "center", fontSize: 11, cursor: "pointer" }}>
                            <input type="checkbox" checked={states.includes(st)} onChange={() => setStates(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])} />
                            <span style={{ marginLeft: 4 }}>{st}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div id="map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}