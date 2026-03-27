"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps" | "highways";
type LandscapeRegion = "all" | "west" | "midwest" | "south" | "east";

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

type LandscapeRow = {
  place_id: number;
  name: string;
  states: string | null;
  acres: number | null;
  owner_name: string | null;
  designation: string | null;
  ecoregion: string | null;
  ecoregion_rank: number | null;
  national_rank: number | null;
  rank_top500: number | null;
  in_top500: boolean;
  rank_top1000: number | null;
  in_top1000: boolean;
  geom: any;
};

const CAMP_THEMES: Record<string, Theme> = {
  COE: { color: "#d32f2f", emoji: "⚓" },
  NF: { color: "#1b5e20", emoji: "🔆" },
  NP: { color: "#5e3225", emoji: "🏞️" },
  NM: { color: "#5e3225", emoji: "🏞️" },
  NS: { color: "#5e3225", emoji: "🏞️" },
  SP: { color: "#26ff00", emoji: "⛰️" },
  SPR: { color: "#26ff00", emoji: "⛰️" },
  SF: { color: "#388e3c", emoji: "🌳" },
  SFW: { color: "#039cfc", emoji: "🐤" },
  USFW: { color: "#039cfc", emoji: "🐤" },
  NWR: { color: "#039cfc", emoji: "🐤" },
  BLM: { color: "#fbc02d", emoji: "🏜️" },
  NRA: { color: "#8d6e63", emoji: "🏕️" },
  SRA: { color: "#8d6e63", emoji: "🏕️" },
  CP: { color: "#9b989b", emoji: "🏙️" },
  BD: { color: "#1a0328", emoji: "✴️" },
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

const LANDSCAPE_REGION_STATES: Record<LandscapeRegion, string[]> = {
  all: [],
  west: ["AK", "AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
  midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  south: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  east: ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"]
};

function formatAcres(acres: number | null) {
  if (acres == null) return "—";
  return `${Math.round(acres).toLocaleString()} acres`;
}

export default function Home() {
  const [states, setStates] = useState<string[]>([]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>([]);
  const [selectedCampSubtypes, setSelectedCampSubtypes] = useState<string[]>(UI_CAMP_SUBTYPES);
  const [selectedHighwaySubtypes, setSelectedHighwaySubtypes] = useState<string[]>(UI_HIGHWAY_SUBTYPES);
  const [favOnlyCategories, setFavOnlyCategories] = useState<PlaceType[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [isRegionsOpen, setIsRegionsOpen] = useState(false);
  const [isLandscapeSectionOpen, setIsLandscapeSectionOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [isCampSubmenuOpen, setIsCampSubmenuOpen] = useState(false);
  const [isHighwaySubmenuOpen, setIsHighwaySubmenuOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [loadedPlaces, setLoadedPlaces] = useState<any[]>([]);
  const [loadedHighways, setLoadedHighways] = useState<any[]>([]);

  const [isRouteMode, setIsRouteMode] = useState(false);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeMessage, setRouteMessage] = useState("");

  const [showLandscapes, setShowLandscapes] = useState(false);
  const [landscapeRegion, setLandscapeRegion] = useState<LandscapeRegion>("all");

  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const lastFetchTimerRef = useRef<any>(null);
  const isPopupOpenRef = useRef<boolean>(false);

  const markersMapRef = useRef<Map<string, any>>(new Map());
  const campMarkersRef = useRef<any[]>([]);
  const nonClusterMarkersRef = useRef<any[]>([]);
  const highwayLinesRef = useRef<any[]>([]);
  const landscapePolygonsRef = useRef<any[]>([]);

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

  const getMarkerStyle = (
    google: any,
    type: PlaceType,
    subtype: string,
    zoom: number,
    isFavorite: boolean
  ) => {
    const baseSize = zoom <= 7 ? 20 : zoom <= 10 ? 30 : 40;
    const strokeColor = isFavorite ? "#FFD700" : "#ffffff";
    const strokeWeight = isFavorite ? 6 : 2;

    if (type === "birds") {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: baseSize / 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeWeight: isFavorite ? 3 : 2,
        strokeColor: isFavorite ? "#FFD700" : "#f80808",
        labelOrigin: new google.maps.Point(0, 0)
      };
    }

    if (type === "hikes") {
  return {
    path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z",
    scale: baseSize / 20,
    fillColor: "#c4fcfe",
    fillOpacity: 1,
    strokeWeight: isFavorite ? 3 : 2,
    strokeColor: isFavorite ? "#f3cf05" : "#f80808",
    labelOrigin: new google.maps.Point(0, 1)
  };
}

    const theme = CAMP_THEMES[subtype] || CAMP_THEMES.default;
    return {
      path: "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1 1 10,-30 C 10,-22 2,-20 0,0 z",
      scale: baseSize / 21,
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

    [...nonClusterMarkersRef.current, ...campMarkersRef.current].forEach((m) => {
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
} else if (type === "hikes") {
  m.setLabel(
    z >= 5
      ? {
          text: "🏃",
          fontSize: z <= 6 ? "18px" : z <= 8 ? "20px" : "22px",
          color: "black",
          fontWeight: "700"
        }
      : null
  );
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

  const clearHighways = () => {
    highwayLinesRef.current.forEach((line) => line.setMap(null));
    highwayLinesRef.current = [];
  };

  const clearLandscapes = () => {
    landscapePolygonsRef.current.forEach((poly) => poly.setMap(null));
    landscapePolygonsRef.current = [];
  };

  const addLandscapeFeature = (
    google: any,
    map: any,
    geometry: any,
    row: LandscapeRow
  ) => {
    const createPolygon = (paths: any[]) => {
      const poly = new google.maps.Polygon({
        paths,
        strokeColor: "#2e7d32",
        strokeOpacity: 1,
        strokeWeight: 1.5,
        fillColor: "#66bb6a",
        fillOpacity: 0.65,
        map,
        zIndex: 2
      });

      poly.addListener("click", (e: any) => {
        if (!infoWindowRef.current) return;

        const portfolioRank = row.rank_top1000 ?? "—";

        infoWindowRef.current.setContent(`
          <div style="padding:10px; font-family:sans-serif; min-width:220px; max-width:280px;">
            <div style="font-weight:700; font-size:15px; margin-bottom:8px;">
              ${escapeHtml(row.name)}
            </div>
            <div style="font-size:12px; line-height:1.55;">
              <div><span style="font-weight:700;">States:</span> ${escapeHtml(row.states || "—")}</div>
              <div><span style="font-weight:700;">Acres:</span> ${escapeHtml(formatAcres(row.acres))}</div>
              <div><span style="font-weight:700;">Owner:</span> ${escapeHtml(row.owner_name || "—")}</div>
              <div><span style="font-weight:700;">Designation:</span> ${escapeHtml(row.designation || "—")}</div>
              <div><span style="font-weight:700;">Ecoregion:</span> ${escapeHtml(row.ecoregion || "—")}</div>
              <div><span style="font-weight:700;">Ecoregion Rank:</span> ${escapeHtml(row.ecoregion_rank ?? "—")}</div>
              <div><span style="font-weight:700;">National Rank:</span> ${escapeHtml(row.national_rank ?? "—")}</div>
              <div><span style="font-weight:700;">Top 1000 Rank:</span> ${escapeHtml(portfolioRank)}</div>
            </div>
          </div>
        `);

        infoWindowRef.current.setPosition(e.latLng);
        infoWindowRef.current.open(map);
      });

      landscapePolygonsRef.current.push(poly);
    };

    if (!geometry) return;

    if (geometry.type === "Polygon") {
      const paths = geometry.coordinates.map((ring: number[][]) =>
        ring.map(([lng, lat]) => ({ lat, lng }))
      );
      createPolygon(paths);
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon: number[][][]) => {
        const paths = polygon.map((ring: number[][]) =>
          ring.map(([lng, lat]) => ({ lat, lng }))
        );
        createPolygon(paths);
      });
    }
  };

  const loadLandscapes = async () => {
    clearLandscapes();

    if (!showLandscapes || !mapRef.current) return;

    let query = supabase
      .from("whereto_top_portfolios_web")
      .select(
        "place_id,name,states,acres,owner_name,designation,ecoregion,ecoregion_rank,national_rank,rank_top1000,in_top1000,geom"
      )
      .eq("in_top1000", true)
      .order("rank_top1000", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Landscape load error:", error);
      return;
    }

    let rows = (data ?? []) as LandscapeRow[];

    if (landscapeRegion !== "all") {
      rows = rows.filter((row) => {
        const rowStates = (row.states || "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);

        return rowStates.some((st) =>
          LANDSCAPE_REGION_STATES[landscapeRegion].includes(st)
        );
      });
    }

    const google = (window as any).google;
    if (!google) return;

    rows.forEach((row) => {
      if (!row.geom) return;
      addLandscapeFeature(google, mapRef.current, row.geom, row);
    });
  };

  const loadHighways = async () => {
    clearHighways();

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

      let lineColor = "#75736f";
      if (h.favorite) lineColor = "#FFD700";
      else if (h.subtype === "Backcountry") lineColor = "#e46a13";

      const segments = geo.type === "MultiLineString" ? geo.coordinates : [geo.coordinates];

      segments.forEach((segment: any[]) => {
        const path = segment.map((c) => ({ lat: c[1], lng: c[0] }));
        const poly = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: lineColor,
          strokeOpacity: 0.7,
          strokeWeight: h.favorite ? 7 : 3.5,
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
    const marker = markersMapRef.current.get(String(place.id));
    if (!marker || !mapRef.current) return;

    isPopupOpenRef.current = true;
    const t = place.place_type as PlaceType;
    const sub = place.subtype || "";
    const navLat = place.nav_lat ?? place.lat;
    const navLon = place.nav_lon ?? place.lon;
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${navLat},${navLon}`;
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

  const clearPlaceMarkers = () => {
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }

    campMarkersRef.current.forEach((m) => m.setMap(null));
    nonClusterMarkersRef.current.forEach((m) => m.setMap(null));
    campMarkersRef.current = [];
    nonClusterMarkersRef.current = [];
    markersMapRef.current.clear();
  };

  const loadPlaces = async () => {
    if (!mapRef.current || !clustererRef.current || isPopupOpenRef.current) return;

    await loadHighways();
    clearPlaceMarkers();

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

    const campMarkers: any[] = [];
    const nonClusterMarkers: any[] = [];

    filteredData.forEach((r) => {
      const latVal = Number(r.lat);
      const lonVal = Number(r.lon);
      if (!Number.isFinite(latVal) || !Number.isFinite(lonVal)) return;

      const marker = new google.maps.Marker({
        position: { lat: latVal, lng: lonVal },
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
      markersMapRef.current.set(String(r.id), marker);

      if (t === "camps") {
        campMarkers.push(marker);
      } else {
        marker.setMap(mapRef.current);
        nonClusterMarkers.push(marker);
      }
    });

    campMarkersRef.current = campMarkers;
    nonClusterMarkersRef.current = nonClusterMarkers;

    clustererRef.current.addMarkers(campMarkersRef.current);
    applyMarkerSizing();
  };

  const scheduleLoad = () => {
    if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
    lastFetchTimerRef.current = setTimeout(() => loadPlaces(), 400);
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) return;
    if (document.getElementById("google-maps-script")) return;

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;

    const clusterScript = document.createElement("script");
    clusterScript.src = "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";

    script.onload = () => {
      document.head.appendChild(clusterScript);
      clusterScript.onload = () => {
        const google = (window as any).google;
        const MarkerClusterer = (window as any).markerClusterer.MarkerClusterer;
        const SuperClusterAlgorithm = (window as any).markerClusterer.SuperClusterAlgorithm;

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

        clustererRef.current = new MarkerClusterer({
          map,
          markers: [],
          algorithm: new SuperClusterAlgorithm({
            radius: 32,
            maxZoom: 11
          }),
          renderer: {
            render: ({ count, position }: any) => {
              const size = count < 10 ? 22 : count < 50 ? 26 : count < 100 ? 30 : 34;

              return new google.maps.Marker({
                position,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: size / 2,
                  fillColor: "#2c6bed",
                  fillOpacity: 0.78,
                  strokeColor: "#ffffff",
                  strokeWeight: 2
                },
                label: {
                  text: String(count),
                  color: "white",
                  fontSize: "11px",
                  fontWeight: "bold"
                },
                zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count
              });
            }
          }
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

  useEffect(() => {
    if (mapRef.current) {
      loadLandscapes();
    }
  }, [showLandscapes, landscapeRegion]);

  const placeResults =
    searchQuery.length > 1
      ? loadedPlaces.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
      : [];

  const highwayResults =
    searchQuery.length > 1
      ? loadedHighways.filter((h) => h.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
      : [];

  const hasAnySelectedStates = states.length > 0;
  const categoryCount = placeTypes.length + (showLandscapes ? 1 : 0);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div
        style={{
          position: "absolute",
          right: 12,
          top: 78,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          width: 118
        }}
      >
        <a
          href="/climate-sql"
          style={{
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "8px 10px",
            textDecoration: "none",
            color: "#333",
            fontWeight: 700,
            fontSize: 13,
            textAlign: "center",
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
            background: isRouteMode ? "#188038" : "white",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "8px 10px",
            color: isRouteMode ? "white" : "#333",
            fontWeight: 700,
            fontSize: 13,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            cursor: "pointer"
          }}
        >
          {isRouteMode ? "Route ✓" : "Build Route"}
        </button>

        <a
          href="/lastgreatplaces"
          style={{
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "8px 10px",
            textDecoration: "none",
            color: "#333",
            fontWeight: 700,
            fontSize: 13,
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}
        >
          Landscapes
        </a>
      </div>

      {routeMessage && (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 176,
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
          width: isFilterOpen ? "min(340px, calc(100vw - 24px - 130px))" : 48,
          minWidth: isFilterOpen ? 240 : 48,
          maxWidth: "calc(100vw - 154px)",
          maxHeight: "calc(100vh - 24px)",
          overflowY: isFilterOpen ? "auto" : "visible",
          padding: isFilterOpen ? 12 : 4,
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          transition: "width 0.2s"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            position: "sticky",
            top: 0,
            background: "white",
            zIndex: 2,
            paddingBottom: 8
          }}
        >
          {isFilterOpen ? (
            <>
              <button
                onClick={() => setIsFilterOpen(false)}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  width: 32,
                  height: 32,
                  background: "#f5f5f5",
                  cursor: "pointer",
                  color: "#333",
                  fontSize: 18,
                  lineHeight: 1,
                  fontWeight: 700,
                  flexShrink: 0
                }}
                aria-label="Close filters"
                title="Close filters"
              >
                ×
              </button>

              <div style={{ fontWeight: 700, fontSize: 16, color: "#222" }}>
                Filters
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsFilterOpen(true)}
              style={{
                width: 40,
                height: 40,
                border: "1px solid #ccc",
                borderRadius: 6,
                background: "#f5f5f5",
                cursor: "pointer",
                color: "#333",
                fontSize: 20,
                lineHeight: 1,
                fontWeight: 700
              }}
              aria-label="Show filters"
              title="Show filters"
            >
              ☰
            </button>
          )}
        </div>

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
                  padding: "10px 10px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  fontSize: "13px",
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

            {([
              { key: "birds" as PlaceType, label: "🪺 Birds" },
              { key: "hikes" as PlaceType, label: "🥾 Hikes" },
              { key: "camps" as PlaceType, label: "⛺ Camps" },
              { key: "highways" as PlaceType, label: "🛣️ Highways" }
            ]).map((item) => (
              <div key={item.key}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={placeTypes.includes(item.key)}
                    onChange={() =>
                      setPlaceTypes((prev) =>
                        prev.includes(item.key)
                          ? prev.filter((x) => x !== item.key)
                          : [...prev, item.key]
                      )
                    }
                  />
                  <span style={{ marginLeft: 8, flexGrow: 1 }}>{item.label}</span>

                  {(item.key === "camps" || item.key === "highways") && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        item.key === "camps"
                          ? setIsCampSubmenuOpen(!isCampSubmenuOpen)
                          : setIsHighwaySubmenuOpen(!isHighwaySubmenuOpen);
                      }}
                      style={{
                        fontSize: 10,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 5px"
                      }}
                    >
                      {item.key === "camps"
                        ? isCampSubmenuOpen ? "▲" : "▼"
                        : isHighwaySubmenuOpen ? "▲" : "▼"}
                    </button>
                  )}

                  <button
                    onClick={() =>
                      setFavOnlyCategories((prev) =>
                        prev.includes(item.key)
                          ? prev.filter((x) => x !== item.key)
                          : [...prev, item.key]
                      )
                    }
                    style={{
                      background: favOnlyCategories.includes(item.key) ? "#fff8dc" : "transparent",
                      border: favOnlyCategories.includes(item.key) ? "1px solid #d4af37" : "1px solid transparent",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: "16px",
                      lineHeight: 1,
                      padding: "2px 4px",
                      color: favOnlyCategories.includes(item.key) ? "#b8860b" : "#999"
                    }}
                    title="Favorites only"
                  >
                    ★
                  </button>
                </div>

                {item.key === "camps" && isCampSubmenuOpen && (
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
                        onClick={() => setSelectedCampSubtypes(UI_CAMP_SUBTYPES)}
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

                {item.key === "highways" && isHighwaySubmenuOpen && (
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
                        onClick={() => setSelectedHighwaySubtypes(UI_HIGHWAY_SUBTYPES)}
                        style={{ flex: 1, fontSize: "9px", fontWeight: "bold", padding: "2px", cursor: "pointer" }}
                      >
                        ALL
                      </button>
                      <button
                        onClick={() => setSelectedHighwaySubtypes([])}
                        style={{ flex: 1, fontSize: "9px", fontWeight: "bold", padding: "2px", cursor: "pointer" }}
                      >
                        NONE
                      </button>
                    </div>

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
                marginTop: 10,
                marginBottom: 8,
                borderTop: "1px solid #eee",
                paddingTop: 10
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8
                }}
              >
                <button
                  onClick={() => setIsLandscapeSectionOpen((prev) => !prev)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontWeight: 700,
                    color: "#666",
                    fontSize: 13
                  }}
                >
                  <span>{isLandscapeSectionOpen ? "▼" : "▶"}</span>
                  <span>LAST GREAT PLACES</span>
                </button>
              </div>

              {isLandscapeSectionOpen && (
                <>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      marginBottom: 10,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showLandscapes}
                      onChange={(e) => setShowLandscapes(e.target.checked)}
                    />
                    Show Top 1000 Landscapes
                  </label>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
                      Region
                    </div>
                    <select
                      value={landscapeRegion}
                      onChange={(e) => setLandscapeRegion(e.target.value as LandscapeRegion)}
                      style={{
                        width: "100%",
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        padding: "8px",
                        fontSize: 12,
                        background: "white",
                        color: "#333"
                      }}
                    >
                      <option value="all">All regions</option>
                      <option value="west">West</option>
                      <option value="midwest">Midwest</option>
                      <option value="south">South</option>
                      <option value="east">East</option>
                    </select>
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "#666",
                      lineHeight: 1.4
                    }}
                  >
                    Landscape polygons are filtered separately from camps, birds, hikes, and highways.
                  </div>
                </>
              )}
            </div>

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
              <button
                onClick={() => setIsRegionsOpen((prev) => !prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontWeight: 700,
                  color: "#666",
                  fontSize: 13
                }}
              >
                <span>{isRegionsOpen ? "▼" : "▶"}</span>
                <span>REGIONS & STATES</span>
              </button>

              <button
                onClick={() => setStates([])}
                style={{
                  fontSize: 10,
                  cursor: "pointer",
                  color: "#f44336",
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontWeight: 700
                }}
              >
                Clear All
              </button>
            </div>

            {isRegionsOpen && (
              <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
                {Object.entries(STATE_GROUPS).map(([groupName, groupStates]) => {
                  const groupSelected = groupStates.length > 0 && groupStates.every((st) => states.includes(st));

                  return (
                    <div
                      key={groupName}
                      style={{
                        marginBottom: 6,
                        background: groupSelected ? "#eef5ff" : "#f8f9fa",
                        borderRadius: 6,
                        padding: "2px 0"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "6px 8px",
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

                        <span
                          style={{
                            flexGrow: 1,
                            fontWeight: groupSelected ? 700 : 600,
                            fontSize: 12
                          }}
                        >
                          {groupName}
                        </span>

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
                              fontSize: 10,
                              cursor: "pointer",
                              color: "#007bff",
                              background: "#e7f1ff",
                              border: "none",
                              padding: "4px 6px",
                              borderRadius: 4,
                              fontWeight: 700
                            }}
                          >
                            Select All
                          </button>
                        )}
                      </div>

                      {openGroups.includes(groupName) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "0 12px 8px 12px" }}>
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
            )}

            <div
              style={{
                marginTop: 12,
                paddingTop: 8,
                borderTop: "1px solid #eee",
                fontSize: 12,
                color: "#666",
                lineHeight: 1.35
              }}
            >
              {categoryCount === 0 && !hasAnySelectedStates
                ? "Choose categories, landscapes, and regions to display on the map."
                : "Tap icons, roads, or landscape polygons for details."}
            </div>
          </div>
        )}
      </div>

      <div id="map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}