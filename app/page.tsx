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
  "NRA": { color: "#8d6e63", emoji: "🏕️" },     
  "SRA": { color: "#8d6e63", emoji: "🏕️" },     
  "CP": { color: "#00acc1", emoji: "🏙️" },      
  "default": { color: "#607d8b", emoji: "⛺" }  
};

const CAMP_SUBTYPE_LABELS: Record<string, string> = {
  "COE": "Army Corps", "NF": "Nat. Forest", "NP": "Nat. Park", "SP": "State Park",
  "SF": "State Forest", "BLM": "BLM", "NRA": "Rec Area", "SRA": "Rec Area", "CP": "Local Park",
  "SFW": "Fish/Wild", "RES": "Other/Res"
};

const UI_CAMP_SUBTYPES = ["COE", "NF", "NP", "SP", "SF", "BLM", "NRA", "CP", "SFW", "RES"];

const STATE_GROUPS: Record<string, string[]> = {
  "South": ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  "East": ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"],
  "Midwest": ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  "West": ["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
  "AK/Canada": [] 
};

export default function Home() {
  const [states, setStates] = useState<string[]>(["NC"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["highways"]);
  const [selectedCampSubtypes, setSelectedCampSubtypes] = useState<string[]>(Object.keys(CAMP_SUBTYPE_LABELS));
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
    states: new Set<string>(["NC"]),
    types: new Set<PlaceType>(["highways"]),
    campSubtypes: new Set<string>(Object.keys(CAMP_SUBTYPE_LABELS))
  });

  useEffect(() => { 
    filtersRef.current.states = new Set(states); 
    filtersRef.current.types = new Set(placeTypes);
    filtersRef.current.campSubtypes = new Set(selectedCampSubtypes);
  }, [states, placeTypes, selectedCampSubtypes]);

  const getMarkerStyle = (google: any, type: PlaceType, subtype: string, zoom: number) => {
    const baseSize = zoom <= 7 ? 20 : zoom <= 10 ? 30 : 40;
    if (type === "birds") {
      return {
        path: google.maps.SymbolPath.CIRCLE, scale: baseSize / 2, fillColor: "#ffffff", 
        fillOpacity: 1, strokeWeight: 4, strokeColor: "#f80808", labelOrigin: new google.maps.Point(0, 0)
      };
    }
    if (type === "hikes") return { path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z", scale: baseSize / 20, fillColor: "#28a745", fillOpacity: 1, strokeWeight: 2, strokeColor: "#ffffff" };
    const theme = Object.keys(CAMP_THEMES).find(k => (subtype || "").includes(k)) ? CAMP_THEMES[Object.keys(CAMP_THEMES).find(k => (subtype || "").includes(k))!] : CAMP_THEMES["default"];
    return { 
      path: "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1 1 10,-30 C 10,-22 2,-20 0,0 z", 
      scale: baseSize / 16, fillColor: theme.color, fillOpacity: 1, strokeWeight: 1.5, strokeColor: "#ffffff", labelOrigin: new google.maps.Point(0, -30) 
    };
  };

  const applyMarkerSizing = () => {
    if (!mapRef.current) return;
    const google = (window as any).google;
    const z = mapRef.current.getZoom() ?? 7;
    placeMarkersRef.current.forEach(m => {
      const type = (m as any).__type as PlaceType;
      m.setIcon(getMarkerStyle(google, type, (m as any).__subtype, z));
      if (type === "birds") {
        m.setLabel({ text: "🦅", fontSize: z <= 8 ? "18px" : "26px", color: "black", fontWeight: "700" });
      } else {
        m.setLabel(z > 7 ? { text: (m as any).__emoji, fontSize: z <= 11 ? "14px" : "18px", color: "white", fontWeight: "700" } : null);
      }
    });
  };

  const loadHighways = async () => {
    highwayLinesRef.current.forEach(line => line.setMap(null));
    highwayLinesRef.current = [];
    if (!filtersRef.current.types.has("highways")) return;

    const { data, error } = await supabase.from("byways").select("geom_geojson, name, designats").in("state", Array.from(filtersRef.current.states));
    if (error || !data) return;

    const google = (window as any).google;
    data.forEach(h => {
      const geo = h.geom_geojson;
      if (!geo || !geo.coordinates) return;
      const segments = geo.type === "MultiLineString" ? geo.coordinates : [geo.coordinates];
      segments.forEach((segment: any[]) => {
        const path = segment.map(c => ({ lat: c[1], lng: c[0] }));
        const poly = new google.maps.Polyline({
          path, geodesic: true, strokeColor: "#4e342e", strokeOpacity: 0.8, strokeWeight: 4, map: mapRef.current
        });
        poly.addListener("click", (e: any) => {
          infoWindowRef.current.setContent(`<div style="padding:10px; font-family:sans-serif;"><b>${h.name || "Scenic Byway"}</b><br/><span style="font-size:12px; color:#555;">${h.designats || ""}</span></div>`);
          infoWindowRef.current.setPosition(e.latLng);
          infoWindowRef.current.open(mapRef.current);
        });
        highwayLinesRef.current.push(poly);
      });
    });
  };

  const loadPlaces = async () => {
    if (!mapRef.current || !clustererRef.current) return;
    loadHighways(); 
    clustererRef.current.clearMarkers();
    placeMarkersRef.current = [];
    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types).filter(t => t !== "highways");
    if (!statesArr.length || !typesArr.length) return;

    const { data, error } = await supabase.from("places").select("*").in("state", statesArr).in("place_type", typesArr);
    if (error || !data) return;

    const google = (window as any).google;
    placeMarkersRef.current = data
      .filter(r => r.place_type !== "camps" || Array.from(filtersRef.current.campSubtypes).some(sub => (r.subtype || "").includes(sub)))
      .map(r => {
        const marker = new google.maps.Marker({ position: { lat: Number(r.lat), lng: Number(r.lon) } });
        const t = r.place_type as PlaceType;
        const sub = r.subtype || "";
        const theme = Object.keys(CAMP_THEMES).find(k => sub.includes(k)) ? CAMP_THEMES[Object.keys(CAMP_THEMES).find(k => sub.includes(k))!] : CAMP_THEMES["default"];

        (marker as any).__type = t;
        (marker as any).__subtype = sub;
        (marker as any).__emoji = t === "birds" ? "🦅" : t === "hikes" ? "🥾" : theme.emoji;

        marker.addListener("click", () => {
          // 1. & 2. Polishing: Subtype moved up, "unavailable" added for blanks
          let popup = `<div style="padding:5px; font-family:sans-serif; min-width:160px;">
                        <b>${r.name}</b><br/>
                        <span style="color:#666; font-size:11px; font-weight:bold;">${sub || "N/A"}</span>`;

          if (t === "camps" || t === "hikes") {
            const labels = t === "camps" ? { l1: "Open", l2: "Sites", l3: "Elev" } : { l1: "Length", l2: "Gain", l3: "Difficulty" };
            
            // Function to check for empty strings or nulls
            const val = (str: any) => (str && str.trim() !== "") ? str : "unavailable";

            popup += `<div style="font-size:12px; margin-top:6px; line-height:1.5; border-top: 1px solid #f0f0f0; padding-top:4px;">
                ${labels.l1}: ${val(r.open_length)}<br/>
                ${labels.l2}: ${val(r.sites_gain)}<br/>
                ${labels.l3}: ${val(r.elev_difficulty)}
              </div>`;
          }

          if (r.website && r.website.startsWith('http')) {
            popup += `<div style="margin-top:8px; border-top:1px solid #eee; padding-top:6px;">
                        <a href="${r.website}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8; text-decoration:none; font-size:12px; font-weight:bold;">🌐 Visit Website</a>
                      </div>`;
          }
          popup += `</div>`;
          infoWindowRef.current.setContent(popup);
          infoWindowRef.current.setPosition(marker.getPosition());
          infoWindowRef.current.open(mapRef.current);
        });
        return marker;
      });
    clustererRef.current.addMarkers(placeMarkersRef.current);
    applyMarkerSizing();
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(() => loadPlaces(), 400); 
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
        const map = new google.maps.Map(document.getElementById("map") as HTMLElement, { 
          center: { lat: 35.5, lng: -79.5 }, 
          zoom: 7, 
          mapTypeControl: false, 
          streetViewControl: false
        });
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        clustererRef.current = new (window as any).markerClusterer.MarkerClusterer({ map, algorithmOptions: { maxZoom: 9, gridSize: 60 } });
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
        width: isFilterOpen ? 230 : 40, padding: isFilterOpen ? 12 : 4, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", transition: "width 0.2s"
      }}>
        <button onClick={() => setIsFilterOpen(!isFilterOpen)} style={{ width: "100%", cursor: "pointer", padding: "4px", marginBottom: isFilterOpen ? 8 : 0 }}>{isFilterOpen ? "Close Filters" : "☰"}</button>
        {isFilterOpen && (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#666", marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}>CATEGORIES</div>
            {(["birds", "hikes", "camps", "highways"] as PlaceType[]).map((t) => (
              <div key={t}>
                <label style={{ display: "flex", alignItems: "center", marginBottom: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={placeTypes.includes(t)} onChange={() => setPlaceTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} />
                  <span style={{ marginLeft: 8, textTransform: "capitalize", flexGrow: 1 }}>{t}</span>
                  {t === "camps" && (
                    <button onClick={(e) => { e.preventDefault(); setIsCampSubmenuOpen(!isCampSubmenuOpen); }} style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer" }}>{isCampSubmenuOpen ? "▲" : "▼"}</button>
                  )}
                </label>
                {t === "camps" && isCampSubmenuOpen && (
                  <div style={{ padding: "8px", background: "#f1f3f5", borderRadius: "4px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <button onClick={() => setSelectedCampSubtypes(Object.keys(CAMP_SUBTYPE_LABELS))} style={{ flex: 1, fontSize: "9px", fontWeight: "bold", padding: "2px", cursor: "pointer" }}>ALL</button>
                      <button onClick={() => setSelectedCampSubtypes([])} style={{ flex: 1, fontSize: "9px", fontWeight: "bold", padding: "2px", cursor: "pointer" }}>NONE</button>
                    </div>
                    {UI_CAMP_SUBTYPES.map(sub => (
                      <label key={sub} style={{ fontSize: 11, display: "flex", alignItems: "center", cursor: "pointer", marginBottom: 2 }}>
                        <input 
                          type="checkbox" 
                          checked={selectedCampSubtypes.includes(sub) || (sub === "NRA" && selectedCampSubtypes.includes("SRA"))} 
                          onChange={() => {
                            setSelectedCampSubtypes(prev => {
                              const targets = sub === "NRA" ? ["NRA", "SRA"] : [sub];
                              const isAdding = !prev.includes(sub);
                              return isAdding ? Array.from(new Set([...prev, ...targets])) : prev.filter(x => !targets.includes(x));
                            });
                          }} 
                        />
                        <span style={{ marginLeft: 6 }}>{CAMP_SUBTYPE_LABELS[sub] || sub}</span>
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
            <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {Object.entries(STATE_GROUPS).map(([groupName, groupStates]) => {
                const groupSelected = groupStates.length > 0 && groupStates.every(st => states.includes(st));
                return (
                  <div key={groupName} style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", background: "#f8f9fa", padding: "4px 6px", borderRadius: 4 }}>
                      <button onClick={() => setOpenGroups(prev => prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName])} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, marginRight: 6, fontSize: 10 }}>{openGroups.includes(groupName) ? "▼" : "▶"}</button>
                      <span style={{ flexGrow: 1, fontWeight: 600, fontSize: 11 }}>{groupName}</span>
                      {groupStates.length > 0 && (
                        <button onClick={() => setStates(prev => groupSelected ? prev.filter(st => !groupStates.includes(st)) : Array.from(new Set([...prev, ...groupStates])))} style={{ fontSize: 9, cursor: "pointer", color: "#007bff", background: "#e7f1ff", border: "none", padding: "2px 4px", borderRadius: 3, fontWeight: 700 }}>{groupSelected ? "NONE" : "ALL"}</button>
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