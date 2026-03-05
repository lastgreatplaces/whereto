"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps" | "highways";

const HIGHWAY_THEMES: Record<string, { color: string, weight: number }> = {
  "Backcountry": { color: "#CD7F32", weight: 5 }, 
  "Scenic": { color: "#4e342e", weight: 4 },      
  "default": { color: "#4e342e", weight: 4 }
};

const CAMP_THEMES: Record<string, { color: string, emoji: string }> = {
  "COE": { color: "#d32f2f", emoji: "⚓" }, "NF": { color: "#1b5e20", emoji: "🌲" },      
  "NP": { color: "#5d4037", emoji: "⛰️" }, "SP": { color: "#1976d2", emoji: "🏞️" },      
  "SF": { color: "#388e3c", emoji: "🌳" }, "BLM": { color: "#fbc02d", emoji: "🏜️" },     
  "NRA": { color: "#8d6e63", emoji: "🏕️" }, "SRA": { color: "#8d6e63", emoji: "🏕️" },     
  "CP": { color: "#00acc1", emoji: "🏙️" }, "BD": { color: "#6a1b9a", emoji: "🚐" }, 
  "default": { color: "#607d8b", emoji: "⛺" }  
};

const CAMP_SUBTYPE_LABELS: Record<string, string> = {
  "COE": "Army Corps", "NF": "Nat. Forest", "NP": "Nat. Park", "SP": "State Park",
  "SF": "State Forest", "BLM": "BLM", "NRA": "Rec Area", "SRA": "Rec Area", "CP": "Local Park",
  "BD": "Boondock", "SFW": "Fish/Wild", "RES": "Other/Res"
};

const STATE_GROUPS: Record<string, string[]> = {
  "South": ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  "East": ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"],
  "Midwest": ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  "West": ["AK", "AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
  "Canada": ["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"] 
};

export default function Home() {
  const [states, setStates] = useState<string[]>(["NC", "FL", "AB", "VA"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["hikes", "camps", "highways"]);
  const [selectedCampSubtypes, setSelectedCampSubtypes] = useState<string[]>(Object.keys(CAMP_SUBTYPE_LABELS));
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>(["South", "West", "Canada"]);
  const [isCampSubmenuOpen, setIsCampSubmenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadedPlaces, setLoadedPlaces] = useState<any[]>([]);
  const [loadedHighways, setLoadedHighways] = useState<any[]>([]);

  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const isPopupOpenRef = useRef<boolean>(false);
  const markersMapRef = useRef<Map<string, any>>(new Map());
  const highwayLinesRef = useRef<any[]>([]);
  
  const filtersRef = useRef({
    states: new Set<string>(states),
    types: new Set<PlaceType>(placeTypes),
    campSubtypes: new Set<string>(selectedCampSubtypes),
    onlyFavorites: showOnlyFavorites
  });

  useEffect(() => { 
    filtersRef.current.states = new Set(states); 
    filtersRef.current.types = new Set(placeTypes);
    filtersRef.current.campSubtypes = new Set(selectedCampSubtypes);
    filtersRef.current.onlyFavorites = showOnlyFavorites;
  }, [states, placeTypes, selectedCampSubtypes, showOnlyFavorites]);

  useEffect(() => {
    (window as any).toggleFav = async (id: string, table: string, current: boolean) => {
      const { error } = await supabase.from(table).update({ favorite: !current }).eq('id', id);
      if (!error) {
        if (infoWindowRef.current) infoWindowRef.current.close();
        isPopupOpenRef.current = false;
        loadPlaces();
      }
    };
  }, []);

  const getMarkerStyle = (google: any, type: PlaceType, subtype: string, zoom: number, isFavorite: boolean) => {
    const baseSize = zoom <= 7 ? 20 : zoom <= 10 ? 30 : 40;
    const strokeColor = isFavorite ? "#FFD700" : "#ffffff"; 
    const strokeWeight = isFavorite ? 5 : 2; 

    if (type === "birds") {
      return {
        path: google.maps.SymbolPath.CIRCLE, scale: baseSize / 2, fillColor: "#ffffff", fillOpacity: 1, 
        strokeWeight: isFavorite ? 6 : 4, strokeColor: isFavorite ? "#FFD700" : "#f80808", labelOrigin: new google.maps.Point(0, 0)
      };
    }
    if (type === "hikes") {
        return { path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z", scale: baseSize / 20, fillColor: "#28a745", fillOpacity: 1, strokeWeight: strokeWeight, strokeColor: strokeColor };
    }
    const theme = CAMP_THEMES[subtype] || CAMP_THEMES["default"];
    return { path: "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1 1 10,-30 C 10,-22 2,-20 0,0 z", scale: baseSize / 16, fillColor: theme.color, fillOpacity: 1, strokeWeight: strokeWeight, strokeColor: strokeColor, labelOrigin: new google.maps.Point(0, -30) };
  };

  const applyMarkerSizing = () => {
    if (!mapRef.current) return;
    const google = (window as any).google;
    const z = mapRef.current.getZoom() ?? 7;
    markersMapRef.current.forEach(m => {
      const type = (m as any).__type as PlaceType;
      const isFav = (m as any).__isFavorite;
      m.setIcon(getMarkerStyle(google, type, (m as any).__subtype, z, isFav));
      if (type === "birds") { m.setLabel({ text: "🦅", fontSize: z <= 8 ? "18px" : "26px", color: "black", fontWeight: "700" }); }
      else { m.setLabel(z > 7 ? { text: (m as any).__emoji, fontSize: z <= 11 ? "14px" : "18px", color: "white", fontWeight: "700" } : null); }
    });
  };

  const loadHighways = async () => {
    highwayLinesRef.current.forEach(line => line.setMap(null));
    highwayLinesRef.current = [];
    if (!filtersRef.current.types.has("highways")) return;

    let query = supabase.from("byways").select("id, geom_geojson, name, designats, favorite, subtype").in("state", Array.from(filtersRef.current.states));
    if (filtersRef.current.onlyFavorites) query = query.eq("favorite", true);

    const { data, error } = await query;
    if (error || !data) return;

    setLoadedHighways(data);
    const google = (window as any).google;
    data.forEach(h => {
      const geo = h.geom_geojson;
      if (!geo || !geo.coordinates) return;
      
      const theme = HIGHWAY_THEMES[h.subtype] || HIGHWAY_THEMES["default"];
      const segments = geo.type === "MultiLineString" ? geo.coordinates : [geo.coordinates];
      
      segments.forEach((segment: any[]) => {
        // REVERTED: Using the exact coord mapping that worked before
        const path = segment.map(c => ({ lat: c[1], lng: c[0] }));
        const poly = new google.maps.Polyline({
          path, 
          geodesic: true, 
          strokeColor: h.favorite ? "#FFD700" : theme.color, 
          strokeOpacity: 0.8, 
          strokeWeight: h.favorite ? 6 : theme.weight, 
          map: mapRef.current,
          zIndex: h.favorite ? 60 : (h.subtype === "Backcountry" ? 50 : 5)
        });
        poly.addListener("click", (e: any) => {
          const favLabel = h.favorite ? 'Remove ⭐' : 'Add ⭐';
          const content = `
            <div style="padding:10px; font-family:sans-serif; min-width:150px;">
              <b>${h.name || "Scenic Byway"}</b>${h.favorite ? ' ⭐' : ''}<br/>
              <span style="font-size:11px; color:#666; font-style:italic;">${h.subtype || ""}</span><br/>
              <span style="font-size:12px; color:#555;">${h.designats || ""}</span>
              <div style="margin-top:10px; border-top:1px solid #eee; padding-top:8px;">
                <button onclick="window.toggleFav('${h.id}', 'byways', ${h.favorite})" style="width:100%; padding:6px; cursor:pointer; background:#f8f9fa; border:1px solid #ccc; border-radius:4px; font-size:11px; font-weight:bold;">
                  ${favLabel}
                </button>
              </div>
            </div>`;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.setPosition(e.latLng);
          infoWindowRef.current.open(mapRef.current);
        });
        highwayLinesRef.current.push(poly);
      });
    });
  };

  const triggerPlacePopup = (place: any) => {
    const marker = markersMapRef.current.get(place.id);
    if (!marker || !mapRef.current) return;
    isPopupOpenRef.current = true;
    const t = place.place_type as PlaceType;
    const sub = place.subtype || "";
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
    const favLabel = place.favorite ? 'Remove ⭐' : 'Add ⭐';
    let popup = `<div style="padding:5px; font-family:sans-serif; min-width:180px;">
                  <div style="display:flex; align-items:center; gap:5px;"><b>${place.name}</b>${place.favorite ? '⭐' : ''}</div>
                  <span style="color:#666; font-size:11px; font-weight:bold;">${CAMP_SUBTYPE_LABELS[sub] || sub || "N/A"}</span>`;
    if (t === "camps" || t === "hikes") {
      const labels = t === "camps" ? { l1: "Open", l2: "Sites", l3: "Elev" } : { l1: "Length", l2: "Gain", l3: "Difficulty" };
      const val = (str: any) => (str && str.toString().trim() !== "") ? str : "N/A";
      popup += `<div style="font-size:12px; margin-top:6px; line-height:1.5; border-top: 1px solid #f0f0f0; padding-top:4px;">
          ${labels.l1}: ${val(place.open_length)}<br/>${labels.l2}: ${val(place.sites_gain)}<br/>${labels.l3}: ${val(place.elev_difficulty)}
        </div>`;
    }
    popup += `<div style="margin-top:10px; border-top:1px solid #eee; padding-top:8px; display:flex; flex-direction:column; gap:6px;">
                <button onclick="window.toggleFav('${place.id}', 'places', ${place.favorite})" style="padding:8px; font-size:11px; cursor:pointer; background:#f8f9fa; border:1px solid #ccc; border-radius:4px; font-weight:bold;">${favLabel}</button>
                <a href="${navUrl}" target="_blank" style="background:#1a73e8; color:white; text-decoration:none; font-size:11px; font-weight:bold; padding:8px; border-radius:4px; text-align:center;">🚗 Directions</a>`;
    if (place.website && place.website.startsWith('http')) { popup += `<a href="${place.website}" target="_blank" style="background:#f1f3f4; color:#3c4043; text-decoration:none; font-size:11px; font-weight:bold; padding:8px; border-radius:4px; text-align:center;">🌐 Website</a>`; }
    popup += `</div></div>`;
    mapRef.current.setZoom(12);
    mapRef.current.panTo(marker.getPosition());
    infoWindowRef.current.setContent(popup);
    infoWindowRef.current.open(mapRef.current, marker);
  };

  const loadPlaces = async () => {
    if (!mapRef.current || !clustererRef.current || isPopupOpenRef.current) return;
    loadHighways(); 
    clustererRef.current.clearMarkers();
    markersMapRef.current.clear();
    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types).filter(t => t !== "highways");
    if (!statesArr.length && !filtersRef.current.types.has("highways")) { setLoadedPlaces([]); return; };
    
    let query = supabase.from("places").select("*").in("state", statesArr).in("place_type", typesArr);
    if (filtersRef.current.onlyFavorites) query = query.eq("favorite", true);
    const { data, error } = await query;
    if (error || !data) return;
    const filteredData = data.filter(r => r.place_type !== "camps" || Array.from(filtersRef.current.campSubtypes).includes(r.subtype));
    setLoadedPlaces(filteredData);
    const google = (window as any).google;
    const markers = filteredData.map(r => {
      const marker = new google.maps.Marker({ position: { lat: Number(r.lat), lng: Number(r.lon) }, zIndex: r.favorite ? 1000 : 1 });
      const t = r.place_type as PlaceType;
      const sub = r.subtype || "";
      const theme = CAMP_THEMES[sub] || CAMP_THEMES["default"];
      (marker as any).__type = t; (marker as any).__subtype = sub; (marker as any).__isFavorite = r.favorite === true;
      (marker as any).__emoji = t === "birds" ? "🦅" : t === "hikes" ? "🥾" : theme.emoji;
      marker.addListener("click", () => triggerPlacePopup(r));
      markersMapRef.current.set(r.id, marker);
      return marker;
    });
    clustererRef.current.addMarkers(markers);
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
        const map = new google.maps.Map(document.getElementById("map") as HTMLElement, { center: { lat: 35.5, lng: -79.5 }, zoom: 7, mapTypeControl: false, streetViewControl: false });
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        google.maps.event.addListener(infoWindowRef.current, 'closeclick', () => { isPopupOpenRef.current = false; });
        clustererRef.current = new (window as any).markerClusterer.MarkerClusterer({ map, algorithmOptions: { maxZoom: 9, gridSize: 60 } });
        map.addListener("idle", scheduleLoad);
        map.addListener("zoom_changed", applyMarkerSizing);
        map.addListener("click", () => { isPopupOpenRef.current = false; infoWindowRef.current.close(); });
      };
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => { isPopupOpenRef.current = false; if (mapRef.current) scheduleLoad(); }, [states, placeTypes, selectedCampSubtypes, showOnlyFavorites]);

  const placeResults = searchQuery.length > 1 ? loadedPlaces.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5) : [];
  const highwayResults = searchQuery.length > 1 ? loadedHighways.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5) : [];

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 10, background: "white", border: "1px solid #ccc", borderRadius: 8, width: isFilterOpen ? 240 : 40, padding: isFilterOpen ? 12 : 4, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", transition: "width 0.2s" }}>
        <button onClick={() => setIsFilterOpen(!isFilterOpen)} style={{ width: "100%", cursor: "pointer", padding: "4px", marginBottom: isFilterOpen ? 8 : 0 }}>{isFilterOpen ? "Close Filters" : "☰"}</button>
        {isFilterOpen && (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 15, position: "relative" }}>
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "12px", outline: "none" }} />
              {(placeResults.length > 0 || highwayResults.length > 0) && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #ddd", borderRadius: "0 0 4px 4px", zIndex: 20, boxShadow: "0 4px 6px rgba(0,0,0,0.1)", maxHeight: "250px", overflowY: "auto" }}>
                  {placeResults.map(p => ( <div key={p.id} onClick={() => { triggerPlacePopup(p); setSearchQuery(""); }} style={{ padding: "8px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: "11px" }}><b>📍 {p.name}</b> <span style={{ color: "#888", fontSize: "10px" }}>{p.state}</span></div> ))}
                  {highwayResults.map((h, i) => ( <div key={i} onClick={() => { const geo = h.geom_geojson; const firstCoord = geo.type === "MultiLineString" ? geo.coordinates[0][0] : geo.coordinates[0]; mapRef.current.setZoom(10); mapRef.current.panTo({ lat: firstCoord[1], lng: firstCoord[0] }); setSearchQuery(""); }} style={{ padding: "8px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: "11px" }}><b>🛣️ {h.name}</b></div> ))}
                </div>
              )}
            </div>
            <div style={{ fontWeight: 700, color: "#666", marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>CATEGORIES</span><label style={{ display: "flex", alignItems: "center", fontSize: "10px", cursor: "pointer", color: showOnlyFavorites ? "#d4af37" : "#666" }}><input type="checkbox" checked={showOnlyFavorites} onChange={() => setShowOnlyFavorites(!showOnlyFavorites)} style={{ marginRight: "4px" }} />⭐ ONLY</label></div>
            {(["birds", "hikes", "camps", "highways"] as PlaceType[]).map((t) => (
              <div key={t}>
                <label style={{ display: "flex", alignItems: "center", marginBottom: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={placeTypes.includes(t)} onChange={() => setPlaceTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} />
                  <span style={{ marginLeft: 8, textTransform: "capitalize", flexGrow: 1 }}>{t}</span>
                  {t === "camps" && ( <button onClick={(e) => { e.preventDefault(); setIsCampSubmenuOpen(!isCampSubmenuOpen); }} style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer" }}>{isCampSubmenuOpen ? "▲" : "▼"}</button> )}
                </label>
                {t === "camps" && isCampSubmenuOpen && (
                  <div style={{ padding: "8px", background: "#f1f3f5", borderRadius: "4px", marginBottom: "10px" }}>
                    {["COE", "NF", "NP", "SP", "SF", "BLM", "BD", "NRA", "CP", "SFW", "RES"].map(sub => (
                      <label key={sub} style={{ fontSize: 11, display: "flex", alignItems: "center", cursor: "pointer", marginBottom: 2 }}>
                        <input type="checkbox" checked={selectedCampSubtypes.includes(sub) || (sub === "NRA" && selectedCampSubtypes.includes("SRA"))} onChange={() => { setSelectedCampSubtypes(prev => { const targets = sub === "NRA" ? ["NRA", "SRA"] : [sub]; const isAdding = !prev.includes(sub); return isAdding ? Array.from(new Set([...prev, ...targets])) : prev.filter(x => !targets.includes(x)); }); }} />
                        <span style={{ marginLeft: 6 }}>{CAMP_SUBTYPE_LABELS[sub] || sub}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}><span style={{ fontWeight: 700, color: "#666" }}>REGIONS</span><button onClick={() => setStates([])} style={{ fontSize: 9, cursor: "pointer", color: "#f44336", background: "none", border: "none", padding: 0, fontWeight: 700 }}>CLEAR</button></div>
            <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {Object.entries(STATE_GROUPS).map(([groupName, groupStates]) => {
                const groupSelected = groupStates.length > 0 && groupStates.every(st => states.includes(st));
                return (
                  <div key={groupName} style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", background: "#f8f9fa", padding: "4px 6px", borderRadius: 4 }}>
                      <button onClick={() => setOpenGroups(prev => prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName])} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, marginRight: 6, fontSize: 10 }}>{openGroups.includes(groupName) ? "▼" : "▶"}</button>
                      <span style={{ flexGrow: 1, fontWeight: 600, fontSize: 11 }}>{groupName}</span>
                      {groupStates.length > 0 && ( <button onClick={() => setStates(prev => groupSelected ? prev.filter(st => !groupStates.includes(st)) : Array.from(new Set([...prev, ...groupStates])))} style={{ fontSize: 9, cursor: "pointer", color: "#007bff", background: "#e7f1ff", border: "none", padding: "2px 4px", borderRadius: 3, fontWeight: 700 }}>{groupSelected ? "NONE" : "ALL"}</button> )}
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