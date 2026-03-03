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

const ALL_STATES = [
  "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function Home() {
  const [states, setStates] = useState<string[]>(["NC", "VA", "WV"]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>(["birds", "hikes", "camps"]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  const filtersRef = useRef({
    states: new Set<string>(["NC", "VA", "WV"]),
    types: new Set<PlaceType>(["birds", "hikes", "camps"]),
  });

  useEffect(() => { filtersRef.current.states = new Set(states); }, [states]);
  useEffect(() => { filtersRef.current.types = new Set(placeTypes); }, [placeTypes]);

  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);

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

  const loadPlacesForSelectedFilters = async () => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of placeMarkersRef.current) m.setMap(null);
    placeMarkersRef.current = [];

    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types);
    if (!statesArr.length || !typesArr.length) return;

    const { data, error } = await supabase.from("places").select("*").in("state", statesArr).in("place_type", typesArr);
    if (error) return;

    const google = (window as any).google;
    const z = map.getZoom() ?? 7;
    const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
    const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";

    for (const r of data || []) {
      const latVal = r.lat;
      const lonVal = r.lon;
      const nameVal = r.name;

      if (typeof latVal !== "number" || typeof lonVal !== "number") continue;

      const t = r.place_type as PlaceType;
      const emoji = emojiForType(t, r.subtype);
      const marker = new google.maps.Marker({
        position: { lat: latVal, lng: lonVal },
        map,
        icon: makeIcon(google, scale, getColorForType(t)),
        label: { text: emoji, fontSize },
      });

      (marker as any).__emoji = emoji;
      (marker as any).__type = t;

      marker.addListener("click", () => {
        let extraHtml = "";
        if (t === "camps") {
          extraHtml = `<div style="border-top:1px solid #eee; margin-top:6px; padding-top:4px; font-size:12px;">
            ${r.camp_open ? `<div><b>Open:</b> ${r.camp_open}</div>` : ""}
            ${r.camp_sites ? `<div><b>Sites:</b> ${r.camp_sites}</div>` : ""}
            ${r.camp_elevation ? `<div><b>Elevation:</b> ${r.camp_elevation}ft</div>` : ""}
          </div>`;
        } else if (t === "hikes") {
          extraHtml = `<div style="border-top:1px solid #eee; margin-top:6px; padding-top:4px; font-size:12px;">
            ${r.hike_distance ? `<div><b>Dist:</b> ${r.hike_distance}</div>` : ""}
            ${r.hike_difficulty ? `<div><b>Diff:</b> ${r.hike_difficulty}</div>` : ""}
          </div>`;
        }
        
        infoWindowRef.current.setContent(`
          <div style="font-family: Arial; font-size: 14px; min-width: 160px;">
            <div style="font-weight:700;">${nameVal || "Unnamed"}</div>
            <div style="opacity:0.7; font-size:12px;">${t}${r.subtype ? ` • ${r.subtype}` : ""}</div>
            ${extraHtml}
            ${r.website ? `<div style="margin-top:8px;"><a href="${r.website}" target="_blank">Website</a></div>` : ""}
          </div>`);
        infoWindowRef.current.setPosition(marker.getPosition());
        infoWindowRef.current.open(map);
      });
      placeMarkersRef.current.push(marker);
    }
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(async () => {
      await loadBywaysInView();
      await loadPlacesForSelectedFilters();
      applyMarkerSizing();
    }, 250);
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || document.getElementById("gmap-script")) return;
    const script = document.createElement("script");
    script.id = "gmap-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.onload = () => {
      const google = (window as any).google;
      const map = new google.maps.Map(document.getElementById("map") as HTMLElement, { center: { lat: 35.8, lng: -78.6 }, zoom: 7 });
      mapRef.current = map;
      map.data.setStyle({ strokeColor: "#5a3e2b", strokeWeight: 3 });
      infoWindowRef.current = new google.maps.InfoWindow();
      
      map.data.addListener("click", (event: any) => {
        const name = event.feature.getProperty("name");
        const des = event.feature.getProperty("designats");
        infoWindowRef.current.setContent(`
          <div style="font-family: Arial; font-size: 14px; padding: 4px;">
            <div style="font-weight:700;">${name || "Scenic Road"}</div>
            <div style="opacity:0.8; font-size:12px; margin-top:2px;">${des || "Scenic Byway"}</div>
          </div>`);
        infoWindowRef.current.setPosition(event.latLng);
        infoWindowRef.current.open(map);
      });

      map.addListener("idle", scheduleLoad);
      map.addListener("zoom_changed", () => applyMarkerSizing());
      scheduleLoad();
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => { if (mapRef.current) scheduleLoad(); }, [states, placeTypes]);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: 12, top: 12, zIndex: 10,
        background: "white", border: "1px solid #ccc", borderRadius: 8,
        width: isFilterOpen ? 160 : 40, padding: isFilterOpen ? 12 : 4,
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)", transition: "width 0.2s"
      }}>
        <button onClick={() => setIsFilterOpen(!isFilterOpen)} style={{ width: "100%", marginBottom: isFilterOpen ? 10 : 0, cursor: "pointer" }}>
          {isFilterOpen ? "Close Filters" : "☰"}
        </button>

        {isFilterOpen && (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#666", marginBottom: 6 }}>PLACES</div>
            {["birds", "hikes", "camps"].map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", marginBottom: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={placeTypes.includes(t as PlaceType)} onChange={() => togglePlaceType(t as PlaceType)} />
                <span style={{ marginLeft: 6, textTransform: "capitalize" }}>{t}</span>
              </label>
            ))}

            <div style={{ fontWeight: 700, color: "#666", marginTop: 12, marginBottom: 6 }}>STATES</div>
            <div style={{ 
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", 
              maxHeight: "300px", overflowY: "auto", paddingRight: "4px" 
            }}>
              {ALL_STATES.map((st) => (
                <label key={st} style={{ display: "flex", alignItems: "center", fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={states.includes(st)} onChange={() => toggleState(st)} />
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