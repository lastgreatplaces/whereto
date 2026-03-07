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

type RouteStop = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

const CAMP_THEMES: Record<string, Theme> = {
  COE: { color: "#d32f2f", emoji: "⚓" },
  NF: { color: "#1b5e20", emoji: "🌲" },
  NP: { color: "#5d4037", emoji: "⛰️" },
  SP: { color: "#1976d2", emoji: "🏞️" },
  SF: { color: "#388e3c", emoji: "🌳" },
  BLM: { color: "#fbc02d", emoji: "🏜️" },
  NRA: { color: "#8d6e63", emoji: "🏕️" },
  SRA: { color: "#8d6e63", emoji: "🏕️" },
  CP: { color: "#00acc1", emoji: "🏙️" },
  BD: { color: "#6a1b9a", emoji: "🚐" },
  default: { color: "#607d8b", emoji: "⛺" }
};

const CAMP_SUBTYPE_LABELS: Record<string, string> = {
  COE: "Army Corps",
  NF: "Nat. Forest",
  NP: "Nat. Park",
  SP: "State Park",
  SF: "State Forest",
  BLM: "BLM",
  NRA: "Rec Area",
  SRA: "Rec Area",
  CP: "Local Park",
  BD: "Boondock",
  SFW: "Fish/Wild",
  RES: "Other/Res"
};

const UI_CAMP_SUBTYPES = ["COE", "NF", "NP", "SP", "SF", "BLM", "BD", "NRA", "CP", "SFW", "RES"];
const UI_HIGHWAY_SUBTYPES = ["Scenic", "Backcountry"];

const STATE_GROUPS: Record<string, string[]> = {
  South: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  East: ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"],
  Midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  West: ["AK", "AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
  Canada: ["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"]
};

export default function Home() {
  const [states, setStates] = useState<string[]>([]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>([]);
  const [selectedCampSubtypes, setSelectedCampSubtypes] = useState<string[]>([]);
  const [selectedHighwaySubtypes, setSelectedHighwaySubtypes] = useState<string[]>([]);
  const [favOnlyCategories, setFavOnlyCategories] = useState<PlaceType[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [isCampSubmenuOpen, setIsCampSubmenuOpen] = useState(false);
  const [isHighwaySubmenuOpen, setIsHighwaySubmenuOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [loadedPlaces, setLoadedPlaces] = useState<any[]>([]);
  const [loadedHighways, setLoadedHighways] = useState<any[]>([]);

  const [isRouteMode, setIsRouteMode] = useState(false);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeMessage, setRouteMessage] = useState("");

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
    highwaySubtypes: new Set<string>(selectedHighwaySubtypes),
    favOnlyCategories: new Set<PlaceType>(favOnlyCategories)
  });

  useEffect(() => {
    filtersRef.current.states = new Set(states);
    filtersRef.current.types = new Set(placeTypes);
    filtersRef.current.campSubtypes = new Set(selectedCampSubtypes);
    filtersRef.current.highwaySubtypes = new Set(selectedHighwaySubtypes);
    filtersRef.current.favOnlyCategories = new Set(favOnlyCategories);
  }, [states, placeTypes, selectedCampSubtypes, selectedHighwaySubtypes, favOnlyCategories]);

  useEffect(() => {
    if (!routeMessage) return;
    const timer = setTimeout(() => setRouteMessage(""), 2200);
    return () => clearTimeout(timer);
  }, [routeMessage]);

  const escapeHtml = (value: any) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const getMarkerStyle = (google: any, type: PlaceType, subtype: string, zoom: number, isFavorite: boolean) => {
    const baseSize = zoom <= 7 ? 20 : zoom <= 10 ? 30 : 40;
    const strokeColor = isFavorite ? "#FFD700" : "#ffffff";
    const strokeWeight = isFavorite ? 5 : 2;

    if (type === "birds") {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: baseSize / 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeWeight: isFavorite ? 6 : 4,
        strokeColor: isFavorite ? "#FFD700" : "#f80808",
        labelOrigin: new google.maps.Point(0, 0)
      };
    }

    if (type === "hikes") {
      return {
        path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z",
        scale: baseSize / 20,
        fillColor: "#28a745",
        fillOpacity: 1,
        strokeWeight,
        strokeColor
      };
    }

    const theme = CAMP_THEMES[subtype] || CAMP_THEMES.default;
    return {
      path: "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1 1 10,-30 C 10,-22 2,-20 0,0 z",
      scale: baseSize / 16,
      fillColor: theme.color,
      fillOpacity: 1,
      strokeWeight,
      strokeColor,
      labelOrigin: new google.maps.Point(0, -30)
    };
  };

  const applyMarkerSizing = () => {
    if (!mapRef.current) return;
    const google = (window as any).google;
    const z = mapRef.current.getZoom() ?? 4;

    markersMapRef.current.forEach((m) => {
      const type = (m as any).__type as PlaceType;
      const isFav = (m as any).__isFavorite;
      m.setIcon(getMarkerStyle(google, type, (m as any).__subtype, z, isFav));

      if (type === "birds") {
        m.setLabel({
          text: "🦅",
          fontSize: z <= 8 ? "18px" : "26px",
          color: "black",
          fontWeight: "700"
        });
      } else {
        m.setLabel(
          z > 7
            ? {
                text: (m as any).__emoji,
                fontSize: z <= 11 ? "14px" : "18px",
                color: "white",
                fontWeight: "700"
              }
            : null
        );
      }
    });
  };

  const loadHighways = async () => {
    highwayLinesRef.current.forEach((line) => line.setMap(null));
    highwayLinesRef.current = [];

    if (!filtersRef.current.types.has("highways") || filtersRef.current.states.size === 0) return;

    let query = supabase
      .from("byways")
      .select("geom_geojson, name, designats, favorite, subtype")
      .in("state", Array.from(filtersRef.current.states));

    if (filtersRef.current.favOnlyCategories.has("highways")) {
      query = query.eq("favorite", true);
    }

    const { data, error } = await query;
    if (error || !data) return;

    const filteredHighways = data.filter((h) =>
      filtersRef.current.highwaySubtypes.has(h.subtype || "Scenic")
    );

    setLoadedHighways(filteredHighways);
    const google = (window as any).google;

    filteredHighways.forEach((h) => {
      const geo = h.geom_geojson;
      if (!geo || !geo.coordinates) return;

      let lineColor = "#4e342e";
      if (h.favorite) lineColor = "#FFD700";
      else if (h.subtype === "Backcountry") lineColor = "#CC5500";

      const segments = geo.type === "MultiLineString" ? geo.coordinates : [geo.coordinates];

      segments.forEach((segment: any[]) => {
        const path = segment.map((c) => ({ lat: c[1], lng: c[0] }));
        const poly = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: lineColor,
          strokeOpacity: 0.8,
          strokeWeight: h.favorite ? 6 : 4,
          map: mapRef.current,
          zIndex: h.favorite ? 50 : h.subtype === "Backcountry" ? 10 : 5
        });

        poly.addListener("click", (e: any) => {
          infoWindowRef.current.setContent(
            `<div style="padding:10px; font-family:sans-serif;">
              <b>${escapeHtml(h.name || "Scenic Byway")}</b>${h.favorite ? " ⭐" : ""}
              <br/>
              <span style="font-size:12px; color:#555;">${escapeHtml(h.designats || "")}</span>
            </div>`
          );
          infoWindowRef.current.setPosition(e.latLng);
          infoWindowRef.current.open(mapRef.current);
        });

        highwayLinesRef.current.push(poly);
      });
    });
  };

  const addStopToRoute = (place: any) => {
    const stop: RouteStop = {
      id: String(place.id),
      name: place.name,
      lat: Number(place.lat),
      lon: Number(place.lon)
    };

    let added = false;

    setRouteStops((prev) => {
      if (prev.some((s) => s.id === stop.id)) {
        setRouteMessage("That stop is already in the route");
        return prev;
      }
      if (prev.length >= 8) {
        setRouteMessage("Maximum 8 stops allowed");
        return prev;
      }
      added = true;
      return [...prev, stop];
    });

    if (added) {
      setRouteMessage(`Stop ${routeStops.length + 1} added`);
    }

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      isPopupOpenRef.current = false;
    }
  };

  const buildGoogleRouteUrl = () => {
    if (routeStops.length < 2) return "";

    const origin = `${routeStops[0].lat},${routeStops[0].lon}`;
    const destination = `${routeStops[routeStops.length - 1].lat},${routeStops[routeStops.length - 1].lon}`;
    const waypoints = routeStops
      .slice(1, -1)
      .map((s) => `${s.lat},${s.lon}`)
      .join("|");

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
      destination
    )}&travelmode=driving`;

    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }

    return url;
  };

  const openRouteInGoogleMaps = () => {
    if (routeStops.length < 2) {
      setRouteMessage("Add at least 2 stops");
      return;
    }
    const url = buildGoogleRouteUrl();
    window.open(url, "_blank");
  };

  const triggerPlacePopup = (place: any) => {
    const marker = markersMapRef.current.get(place.id);
    if (!marker || !mapRef.current) return;

    isPopupOpenRef.current = true;
    const t = place.place_type as PlaceType;
    const sub = place.subtype || "";
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
    const isAlreadyInRoute = routeStops.some((s) => s.id === String(place.id));
    const canAddStop = routeStops.length < 8 && !isAlreadyInRoute;

    let popup = `<div style="padding:5px; font-family:sans-serif; min-width:190px;">
      <div style="display:flex; align-items:center; gap:5px;">
        <b>${escapeHtml(place.name)}</b>${place.favorite ? "⭐" : ""}
      </div>
      <span style="color:#666; font-size:11px; font-weight:bold;">
        ${escapeHtml(CAMP_SUBTYPE_LABELS[sub] || sub || "N/A")}
      </span>`;

    if (t === "camps" || t === "hikes") {
      const labels =
        t === "camps"
          ? { l1: "Open", l2: "Sites", l3: "Elev" }
          : { l1: "Length", l2: "Gain", l3: "Difficulty" };

      const val = (str: any) => (str && str.toString().trim() !== "" ? str : "N/A");

      popup += `<div style="font-size:12px; margin-top:6px; line-height:1.5; border-top:1px solid #f0f0f0; padding-top:4px;">
        ${labels.l1}: ${escapeHtml(val(place.open_length))}<br/>
        ${labels.l2}: ${escapeHtml(val(place.sites_gain))}<br/>
        ${labels.l3}: ${escapeHtml(val(place.elev_difficulty))}
      </div>`;
    }

    popup += `<div style="margin-top:10px; border-top:1px solid #eee; padding-top:8px; display:flex; flex-direction:column; gap:6px;">`;

    if (!isRouteMode) {
      popup += `<a href="${navUrl}" target="_blank" style="background:#1a73e8; color:white; text-decoration:none; font-size:11px; font-weight:bold; padding:8px; border-radius:4px; text-align:center;">
        🚗 Navigate
      </a>`;
    }

    popup += `<button id="add-stop-btn-${place.id}" ${
      canAddStop ? "" : "disabled"
    } style="background:${canAddStop ? "#188038" : "#bdbdbd"}; color:white; border:none; font-size:11px; font-weight:bold; padding:8px; border-radius:4px; text-align:center; cursor:${
      canAddStop ? "pointer" : "default"
    };">
      ${isAlreadyInRoute ? "✓ Already in Route" : "➕ Add Stop"}
    </button>`;

    if (place.website && place.website.startsWith("http")) {
      popup += `<a href="${place.website}" target="_blank" style="background:#f1f3f4; color:#3c4043; text-decoration:none; font-size:11px; font-weight:bold; padding:8px; border-radius:4px; text-align:center;">
        🌐 Website
      </a>`;
    }

    popup += `</div></div>`;

    mapRef.current.setZoom(12);
    mapRef.current.panTo(marker.getPosition());
    infoWindowRef.current.setContent(popup);
    infoWindowRef.current.open(mapRef.current, marker);

    const google = (window as any).google;
    google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
      const addBtn = document.getElementById(`add-stop-btn-${place.id}`);
      if (addBtn && canAddStop) {
        addBtn.addEventListener("click", () => addStopToRoute(place), { once: true });
      }
    });
  };

  const loadPlaces = async () => {
    if (!mapRef.current || !clustererRef.current || isPopupOpenRef.current) return;

    loadHighways();
    clustererRef.current.clearMarkers();
    markersMapRef.current.clear();

    const statesArr = Array.from(filtersRef.current.states);
    const typesArr = Array.from(filtersRef.current.types).filter((t) => t !== "highways");

    if (!statesArr.length || (!typesArr.length && !filtersRef.current.types.has("highways"))) {
      setLoadedPlaces([]);
      return;
    }

    let query = supabase.from("places").select("*").in("state", statesArr).in("place_type", typesArr);
    const { data, error } = await query;
    if (error || !data) return;

    const filteredData = data.filter((r) => {
      const type = r.place_type as PlaceType;
      if (filtersRef.current.favOnlyCategories.has(type) && !r.favorite) return false;
      if (type === "camps" && !filtersRef.current.campSubtypes.has(r.subtype)) return false;
      return true;
    });

    setLoadedPlaces(filteredData);
    const google = (window as any).google;

    const markers = filteredData.map((r) => {
      const marker = new google.maps.Marker({
        position: { lat: Number(r.lat), lng: Number(r.lon) },
        zIndex: r.favorite ? 1000 : 1
      });

      const t = r.place_type as PlaceType;
      const sub = r.subtype || "";
      const theme = CAMP_THEMES[sub] || CAMP_THEMES.default;

      (marker as any).__type = t;
      (marker as any).__subtype = sub;
      (marker as any).__isFavorite = r.favorite === true;
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
        const map = new google.maps.Map(document.getElementById("map") as HTMLElement, {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false
        });

        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();

        google.maps.event.addListener(infoWindowRef.current, "closeclick", () => {
          isPopupOpenRef.current = false;
        });

        clustererRef.current = new (window as any).markerClusterer.MarkerClusterer({
          map,
          algorithmOptions: { maxZoom: 9, gridSize: 60 }
        });

        map.addListener("idle", scheduleLoad);
        map.addListener("zoom_changed", applyMarkerSizing);
        map.addListener("click", () => {
          isPopupOpenRef.current = false;
          infoWindowRef.current.close();
        });
      };
    };

    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    isPopupOpenRef.current = false;
    if (mapRef.current) scheduleLoad();
  }, [states, placeTypes, selectedCampSubtypes, selectedHighwaySubtypes, favOnlyCategories]);

  const placeResults =
    searchQuery.length > 1
      ? loadedPlaces.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
      : [];

  const highwayResults =
    searchQuery.length > 1
      ? loadedHighways.filter((h) => h.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
      : [];

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "sans-serif" }}>
      <a
        href="/climate"
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          zIndex: 20,
          background: "white",
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: "8px 12px",
          textDecoration: "none",
          color: "#333",
          fontWeight: 700,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}
      >
        Climate Map
      </a>

      <button
        onClick={() => {
          setIsRouteMode((prev) => !prev);
          setRouteMessage(!isRouteMode ? "Route mode on" : "Route mode off");
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
            isPopupOpenRef.current = false;
          }
        }}
        style={{
          position: "absolute",
          right: 12,
          top: 58,
          zIndex: 20,
          background: isRouteMode ? "#188038" : "white",
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: "8px 12px",
          color: isRouteMode ? "white" : "#333",
          fontWeight: 700,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          cursor: "pointer"
        }}
      >
        {isRouteMode ? "Route Mode ✓" : "Build Route"}
      </button>

      {routeMessage && (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 106,
            zIndex: 20,
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
          }}
        >
          {routeMessage}
        </div>
      )}

      {(isRouteMode || routeStops.length > 0) && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 20,
            width: "min(320px, calc(100vw - 24px))",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)"
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Route Builder</div>

          {routeStops.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
              Tap a place marker, then choose <b>Add Stop</b>.
            </div>
          ) : (
            <div style={{ maxHeight: "180px", overflowY: "auto", marginBottom: 10 }}>
              {routeStops.map((stop, i) => (
                <div
                  key={stop.id}
                  style={{
                    fontSize: 12,
                    padding: "6px 0",
                    borderBottom: i < routeStops.length - 1 ? "1px solid #eee" : "none"
                  }}
                >
                  <b>{i + 1}.</b> {stop.name}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={openRouteInGoogleMaps}
              style={{
                flex: 1,
                minWidth: 110,
                background: "#1a73e8",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "9px 10px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Open in Google Maps
            </button>

            <button
              onClick={() => {
                setRouteStops([]);
                setRouteMessage("Route cleared");
              }}
              style={{
                background: "#f1f3f4",
                color: "#333",
                border: "1px solid #ddd",
                borderRadius: 6,
                padding: "9px 10px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Clear Route
            </button>

            <button
              onClick={() => {
                setIsRouteMode(false);
                setRouteMessage("Route mode off");
                if (infoWindowRef.current) {
                  infoWindowRef.current.close();
                  isPopupOpenRef.current = false;
                }
              }}
              style={{
                background: "#f1f3f4",
                color: "#333",
                border: "1px solid #ddd",
                borderRadius: 6,
                padding: "9px 10px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          zIndex: 10,
          background: "white",
          border: "1px solid #ccc",
          borderRadius: 8,
          width: isFilterOpen ? 240 : 40,
          padding: isFilterOpen ? 12 : 4,
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          transition: "width 0.2s"
        }}
      >
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          style={{ width: "100%", cursor: "pointer", padding: "4px", marginBottom: isFilterOpen ? 8 : 0 }}
        >
          {isFilterOpen ? "Close Filters" : "☰"}
        </button>

        {isFilterOpen && (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 15, position: "relative" }}>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                  fontSize: "12px",
                  outline: "none"
                }}
              />

              {(placeResults.length > 0 || highwayResults.length > 0) && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "white",
                    border: "1px solid #ddd",
                    borderRadius: "0 0 4px 4px",
                    zIndex: 20,
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    maxHeight: "250px",
                    overflowY: "auto"
                  }}
                >
                  {placeResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        triggerPlacePopup(p);
                        setSearchQuery("");
                      }}
                      style={{ padding: "8px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: "11px" }}
                    >
                      <b>📍 {p.name}</b> <span style={{ color: "#888", fontSize: "10px" }}>{p.state}</span>
                    </div>
                  ))}

                  {highwayResults.map((h, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        const firstCoord =
                          h.geom_geojson.type === "MultiLineString"
                            ? h.geom_geojson.coordinates[0][0]
                            : h.geom_geojson.coordinates[0];
                        mapRef.current.setZoom(10);
                        mapRef.current.panTo({ lat: firstCoord[1], lng: firstCoord[0] });
                        setSearchQuery("");
                      }}
                      style={{ padding: "8px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: "11px" }}
                    >
                      <b>🛣️ {h.name}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                fontWeight: 700,
                color: "#666",
                marginBottom: 8,
                borderBottom: "1px solid #eee",
                paddingBottom: 4
              }}
            >
              CATEGORIES
            </div>

            {(["birds", "hikes", "camps", "highways"] as PlaceType[]).map((t) => (
              <div key={t}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={placeTypes.includes(t)}
                    onChange={() =>
                      setPlaceTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                  />
                  <span style={{ marginLeft: 8, textTransform: "capitalize", flexGrow: 1 }}>{t}</span>

                  {(t === "camps" || t === "highways") && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        t === "camps"
                          ? setIsCampSubmenuOpen(!isCampSubmenuOpen)
                          : setIsHighwaySubmenuOpen(!isHighwaySubmenuOpen);
                      }}
                      style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", padding: "0 5px" }}
                    >
                      {t === "camps"
                        ? isCampSubmenuOpen
                          ? "▲"
                          : "▼"
                        : isHighwaySubmenuOpen
                        ? "▲"
                        : "▼"}
                    </button>
                  )}

                  <button
                    onClick={() =>
                      setFavOnlyCategories((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "14px",
                      padding: "0 0 0 5px",
                      color: favOnlyCategories.includes(t) ? "#d4af37" : "#ccc"
                    }}
                    title="Favorites only"
                  >
                    ⭐
                  </button>
                </div>

                {t === "camps" && isCampSubmenuOpen && (
                  <div
                    style={{
                      padding: "8px",
                      background: "#f1f3f5",
                      borderRadius: "4px",
                      marginBottom: "10px",
                      marginLeft: 15
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <button
                        onClick={() => setSelectedCampSubtypes(Object.keys(CAMP_SUBTYPE_LABELS))}
                        style={{ flex: 1, fontSize: "9px", fontWeight: "bold", padding: "2px", cursor: "pointer" }}
                      >
                        ALL
                      </button>
                      <button
                        onClick={() => setSelectedCampSubtypes([])}
                        style={{ flex: 1, fontSize: "9px", fontWeight: "bold", padding: "2px", cursor: "pointer" }}
                      >
                        NONE
                      </button>
                    </div>

                    {UI_CAMP_SUBTYPES.map((sub) => (
                      <label
                        key={sub}
                        style={{
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          marginBottom: 2
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            selectedCampSubtypes.includes(sub) ||
                            (sub === "NRA" && selectedCampSubtypes.includes("SRA"))
                          }
                          onChange={() => {
                            setSelectedCampSubtypes((prev) => {
                              const targets = sub === "NRA" ? ["NRA", "SRA"] : [sub];
                              const isAdding = !prev.includes(sub);
                              return isAdding
                                ? Array.from(new Set([...prev, ...targets]))
                                : prev.filter((x) => !targets.includes(x));
                            });
                          }}
                        />
                        <span style={{ marginLeft: 6 }}>{CAMP_SUBTYPE_LABELS[sub] || sub}</span>
                      </label>
                    ))}
                  </div>
                )}

                {t === "highways" && isHighwaySubmenuOpen && (
                  <div
                    style={{
                      padding: "8px",
                      background: "#f1f3f5",
                      borderRadius: "4px",
                      marginBottom: "10px",
                      marginLeft: 15
                    }}
                  >
                    {UI_HIGHWAY_SUBTYPES.map((sub) => (
                      <label
                        key={sub}
                        style={{
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          marginBottom: 2
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedHighwaySubtypes.includes(sub)}
                          onChange={() => {
                            setSelectedHighwaySubtypes((prev) =>
                              prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub]
                            );
                          }}
                        />
                        <span style={{ marginLeft: 6 }}>{sub}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                marginBottom: 8,
                borderBottom: "1px solid #eee",
                paddingBottom: 4
              }}
            >
              <span style={{ fontWeight: 700, color: "#666" }}>REGIONS</span>
              <button
                onClick={() => setStates([])}
                style={{
                  fontSize: 9,
                  cursor: "pointer",
                  color: "#f44336",
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontWeight: 700
                }}
              >
                CLEAR
              </button>
            </div>

            <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {Object.entries(STATE_GROUPS).map(([groupName, groupStates]) => {
                const groupSelected = groupStates.length > 0 && groupStates.every((st) => states.includes(st));

                return (
                  <div key={groupName} style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        background: "#f8f9fa",
                        padding: "4px 6px",
                        borderRadius: 4
                      }}
                    >
                      <button
                        onClick={() =>
                          setOpenGroups((prev) =>
                            prev.includes(groupName)
                              ? prev.filter((g) => g !== groupName)
                              : [...prev, groupName]
                          )
                        }
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          padding: 0,
                          marginRight: 6,
                          fontSize: 10
                        }}
                      >
                        {openGroups.includes(groupName) ? "▼" : "▶"}
                      </button>

                      <span style={{ flexGrow: 1, fontWeight: 600, fontSize: 11 }}>{groupName}</span>

                      {groupStates.length > 0 && (
                        <button
                          onClick={() =>
                            setStates((prev) =>
                              groupSelected
                                ? prev.filter((st) => !groupStates.includes(st))
                                : Array.from(new Set([...prev, ...groupStates]))
                            )
                          }
                          style={{
                            fontSize: 9,
                            cursor: "pointer",
                            color: "#007bff",
                            background: "#e7f1ff",
                            border: "none",
                            padding: "2px 4px",
                            borderRadius: 3,
                            fontWeight: 700
                          }}
                        >
                          {groupSelected ? "NONE" : "ALL"}
                        </button>
                      )}
                    </div>

                    {openGroups.includes(groupName) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "6px 12px" }}>
                        {groupStates.map((st) => (
                          <label
                            key={st}
                            style={{ display: "flex", alignItems: "center", fontSize: 11, cursor: "pointer" }}
                          >
                            <input
                              type="checkbox"
                              checked={states.includes(st)}
                              onChange={() =>
                                setStates((prev) =>
                                  prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
                                )
                              }
                            />
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