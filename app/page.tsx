"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "birds" | "hikes" | "camps" | "highways" | "targets";
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
  landscapes: { color: "#fff3cd", emoji: "🎯" },
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
  RES: "Other/Res",
  landscapes: "Target Area"
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

const ALL_STATES = Array.from(new Set(Object.values(STATE_GROUPS).flat()));

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
const [stateFilterMode, setStateFilterMode] = useState<"national" | "filtered">("national");
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
  stateFilterMode,
  states: new Set<string>(states),
  types: new Set<PlaceType>(placeTypes),
  campSubtypes: new Set<string>(selectedCampSubtypes),
  highwaySubtypes: new Set<string>(selectedHighwaySubtypes),
  favOnlyCategories: new Set<PlaceType>(favOnlyCategories)
});

useEffect(() => {
  filtersRef.current.stateFilterMode = stateFilterMode;
  filtersRef.current.states = new Set(states);
  filtersRef.current.types = new Set(placeTypes);
  filtersRef.current.campSubtypes = new Set(selectedCampSubtypes);
  filtersRef.current.highwaySubtypes = new Set(selectedHighwaySubtypes);
  filtersRef.current.favOnlyCategories = new Set(favOnlyCategories);
}, [
  stateFilterMode,
  states,
  placeTypes,
  selectedCampSubtypes,
  selectedHighwaySubtypes,
  favOnlyCategories
]);

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

  const togglePlaceType = (type: PlaceType) => {
    setPlaceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleFavOnly = (type: PlaceType) => {
    setFavOnlyCategories((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleOpenGroup = (group: string) => {
    setOpenGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
  };

const toggleState = (state: string) => {
  setStateFilterMode("filtered");
  setStates((prev) =>
    prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
  );
};

const toggleStateGroup = (groupName: string) => {
  const groupStates = STATE_GROUPS[groupName] || [];
  const allInGroupSelected = groupStates.every((st) => states.includes(st));

  setStateFilterMode("filtered");
  setStates((prev) => {
    if (allInGroupSelected) {
      return prev.filter((st) => !groupStates.includes(st));
    }
    return Array.from(new Set([...prev, ...groupStates]));
  });
};

const setNationwideStates = () => {
  setStateFilterMode("national");
  setStates([]);
};

const selectAllStates = () => {
  setStateFilterMode("filtered");
  setStates(ALL_STATES);
};

const clearAllStates = () => {
  setStateFilterMode("filtered");
  setStates([]);
};

  const toggleCampSubtype = (subtype: string) => {
    setSelectedCampSubtypes((prev) =>
      prev.includes(subtype) ? prev.filter((s) => s !== subtype) : [...prev, subtype]
    );
  };

  const toggleHighwaySubtype = (subtype: string) => {
    setSelectedHighwaySubtypes((prev) =>
      prev.includes(subtype) ? prev.filter((s) => s !== subtype) : [...prev, subtype]
    );
  };

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

    if (type === "targets") {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: baseSize / 2.2,
        fillColor: "#fff3cd",
        fillOpacity: 1,
        strokeWeight: isFavorite ? 3 : 2,
        strokeColor: isFavorite ? "#f3cf05" : "#8a6d1d",
        labelOrigin: new google.maps.Point(0, 0)
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
                text: "🥾",
                fontSize: z <= 6 ? "18px" : z <= 8 ? "20px" : "22px",
                color: "black",
                fontWeight: "700"
              }
            : null
        );
      } else if (type === "targets") {
        m.setLabel(
          z >= 4
            ? {
                text: "🎯",
                fontSize: z <= 6 ? "16px" : z <= 8 ? "18px" : "20px",
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
        "place_id,name,states,acres,owner_name,designation,ecoregion,ecoregion_rank,rank_top1000,in_top1000,geom"
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

  if (!filtersRef.current.types.has("highways")) {
    setLoadedHighways([]);
    return;
  }

  const statesArr = Array.from(filtersRef.current.states);
  const stateMode = filtersRef.current.stateFilterMode;

  if (stateMode === "filtered" && statesArr.length === 0) {
    setLoadedHighways([]);
    return;
  }

  let query = supabase
    .from("byways")
    .select("geom_geojson, name, state, description, designats, favorite, subtype");

  if (stateMode === "filtered") {
    query = query.in("state", statesArr);
  }

  if (filtersRef.current.favOnlyCategories.has("highways")) {
    query = query.eq("favorite", true);
  }

  const { data, error } = await query;
  if (error || !data) {
    setLoadedHighways([]);
    return;
  }

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
    '<div style="padding:10px; font-family:sans-serif; min-width:220px; max-width:300px;">' +
      '<div style="font-weight:700; font-size:14px; margin-bottom:4px;">' +
        escapeHtml(h.name || "Scenic Byway") +
        (h.favorite ? " ⭐" : "") +
      '</div>' +
      '<div style="font-size:12px; color:#555; margin-bottom:6px;">' +
        'State: ' + escapeHtml(h.state || "—") +
      '</div>' +
      '<div style="font-size:12px; line-height:1.45; color:#333; margin-bottom:6px;">' +
        escapeHtml(h.description || "") +
      '</div>' +
      '<div style="font-size:12px; color:#666;">' +
        escapeHtml(h.designats || "") +
      '</div>' +
    '</div>'
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

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

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

    let popup = `<div style="padding:5px; font-family:sans-serif; min-width:190px; max-width:280px;">
      <div style="display:flex; align-items:center; gap:5px;">
        <b>${escapeHtml(place.name)}</b>${place.favorite ? "⭐" : ""}
      </div>
      <span style="color:#666; font-size:11px; font-weight:bold;">
        ${escapeHtml(CAMP_SUBTYPE_LABELS[sub] || sub || "N/A")}
      </span>`;

    if (t === "targets" && place.notes) {
      popup += `<div style="font-size:12px; margin-top:6px; line-height:1.45; color:#333; border-top:1px solid #f0f0f0; padding-top:6px;">
        ${escapeHtml(place.notes)}
      </div>`;
    }

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
  const stateMode = filtersRef.current.stateFilterMode;
  const typesArr = Array.from(filtersRef.current.types).filter((t) => t !== "highways");

  if (!typesArr.length && !filtersRef.current.types.has("highways")) {
    setLoadedPlaces([]);
    return;
  }

  if (!typesArr.length) {
    setLoadedPlaces([]);
    return;
  }

  if (stateMode === "filtered" && statesArr.length === 0) {
    setLoadedPlaces([]);
    return;
  }

  let query = supabase.from("places").select("*").in("place_type", typesArr);

  if (stateMode === "filtered") {
    query = query.in("state", statesArr);
  }

  const { data, error } = await query;
  if (error || !data) {
    setLoadedPlaces([]);
    return;
  }

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
    (marker as any).__emoji =
      t === "birds" ? "🦅" :
      t === "hikes" ? "🥾" :
      t === "targets" ? "🎯" :
      theme.emoji;

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

  const hasAnySelectedStates = stateFilterMode === "national" || states.length > 0;
  const categoryCount = placeTypes.length + (showLandscapes ? 1 : 0);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div
        id="map"
        style={{ position: "absolute", inset: 0 }}
      />

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
          Last Great Places
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
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {routeStops.map((stop, idx) => (
                <div
                  key={stop.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 12,
                    border: "1px solid #eee",
                    borderRadius: 6,
                    padding: "6px 8px"
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{idx + 1}.</span>{" "}
                    <span>{stop.name}</span>
                  </div>
                  <button
                    onClick={() =>
                      setRouteStops((prev) => prev.filter((s) => s.id !== stop.id))
                    }
                    style={{
                      border: "none",
                      background: "none",
                      color: "#d93025",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={openRouteInGoogleMaps}
              style={{
                flex: 1,
                background: "#1a73e8",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "9px 10px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Open Route
            </button>
            <button
              onClick={() => setRouteStops([])}
              style={{
                background: "#f1f3f4",
                color: "#333",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "9px 10px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

     <div
  style={{
    position: "absolute",
    left: 16,
    top: 16,
    zIndex: 20,
    width: isFilterOpen ? 410 : 56,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100vh - 32px)",
    overflowY: isFilterOpen ? "auto" : "visible",
    background: "white",
    border: "1px solid #d9d9d9",
    borderRadius: 14,
    boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
    padding: isFilterOpen ? 16 : 8,
    transition: "width 0.2s ease, padding 0.2s ease"
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isFilterOpen ? 16 : 0 }}>
    {isFilterOpen ? (
      <>
        <button
          onClick={() => setIsFilterOpen(false)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: "1px solid #d9d9d9",
            background: "#f6f6f6",
            cursor: "pointer",
            fontSize: 26,
            lineHeight: 1
          }}
          title="Close filters"
        >
          ×
        </button>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Filters</div>
      </>
    ) : (
      <button
        onClick={() => setIsFilterOpen(true)}
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: "1px solid #d9d9d9",
          background: "#f6f6f6",
          cursor: "pointer",
          fontSize: 22,
          lineHeight: 1
        }}
        title="Open filters"
      >
        ☰
      </button>
    )}
  </div>

  {isFilterOpen && (
    <>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search..."
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "14px 14px",
          fontSize: 16,
          borderRadius: 10,
          border: "1px solid #d9d9d9",
          marginBottom: 18
        }}
      />

      {(placeResults.length > 0 || highwayResults.length > 0) && (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #eee",
            borderRadius: 10,
            padding: 10,
            background: "#fafafa"
          }}
        >
          {placeResults.map((p) => (
            <div
              key={`p-${p.id}`}
              onClick={() => triggerPlacePopup(p)}
              style={{
                padding: "7px 6px",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
                fontSize: 14
              }}
            >
              {p.name}
            </div>
          ))}
          {highwayResults.map((h, idx) => (
            <div
              key={`h-${idx}`}
              style={{
                padding: "7px 6px",
                fontSize: 14,
                borderBottom: idx === highwayResults.length - 1 ? "none" : "1px solid #eee"
              }}
            >
              {h.name}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 14, fontWeight: 700, color: "#555", marginBottom: 10 }}>
        Categories
      </div>

      <div style={{ borderTop: "1px solid #eee", borderBottom: "1px solid #eee", padding: "8px 0 10px 0" }}>
        {([
          { key: "birds" as PlaceType, label: "🦅 Birds" },
          { key: "hikes" as PlaceType, label: "🥾 Hikes" },
          { key: "camps" as PlaceType, label: "⛺ Camps" },
          { key: "highways" as PlaceType, label: "🛣️ Highways" },
          { key: "targets" as PlaceType, label: "🎯 Targets" }
        ]).map((item) => {
          const checked = placeTypes.includes(item.key);
          const favOnly = favOnlyCategories.includes(item.key);
          const showArrow = item.key === "camps" || item.key === "highways";

          return (
            <div key={item.key} style={{ marginBottom: 6 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "24px 1fr 24px 24px",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 34
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePlaceType(item.key)}
                  style={{ width: 22, height: 22 }}
                />

                <div style={{ fontSize: 14 }}>{item.label}</div>

                <button
                  onClick={() => {
                    if (item.key === "camps") setIsCampSubmenuOpen((v) => !v);
                    if (item.key === "highways") setIsHighwaySubmenuOpen((v) => !v);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: showArrow ? "pointer" : "default",
                    fontSize: 14,
                    color: "#222",
                    visibility: showArrow ? "visible" : "hidden"
                  }}
                >
                  {item.key === "camps"
                    ? isCampSubmenuOpen ? "▾" : "▸"
                    : item.key === "highways"
                    ? isHighwaySubmenuOpen ? "▾" : "▸"
                    : ""}
                </button>

                <button
                  onClick={() => toggleFavOnly(item.key)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 22,
                    color: favOnly ? "#d0a100" : "#999",
                    lineHeight: 1
                  }}
                  title="Favorites only"
                >
                  ★
                </button>
              </div>

              {item.key === "camps" && isCampSubmenuOpen && (
                <div style={{ paddingLeft: 34, paddingTop: 4, display: "grid", gap: 4 }}>
                  {UI_CAMP_SUBTYPES.map((sub) => (
                    <label
                      key={sub}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCampSubtypes.includes(sub)}
                        onChange={() => toggleCampSubtype(sub)}
                      />
                      {CAMP_SUBTYPE_LABELS[sub] || sub}
                    </label>
                  ))}
                </div>
              )}

              {item.key === "highways" && isHighwaySubmenuOpen && (
                <div style={{ paddingLeft: 34, paddingTop: 4, display: "grid", gap: 4 }}>
                  {UI_HIGHWAY_SUBTYPES.map((sub) => (
                    <label
                      key={sub}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedHighwaySubtypes.includes(sub)}
                        onChange={() => toggleHighwaySubtype(sub)}
                      />
                      {sub}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, borderBottom: "1px solid #eee", paddingBottom: 12 }}>
        <button
          onClick={() => setIsLandscapeSectionOpen((v) => !v)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 16,
            fontWeight: 700,
            color: "#666"
          }}
        >
          <span>{isLandscapeSectionOpen ? "▼" : "▶"}</span>
          <span>Landscapes</span>
        </button>

        {isLandscapeSectionOpen && (
          <div style={{ marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={showLandscapes}
                onChange={() => setShowLandscapes((v) => !v)}
                style={{ width: 22, height: 22 }}
              />
              Show Top 1000 Landscapes
            </label>

            <div style={{ marginBottom: 6, fontSize: 14, color: "#666" }}>Region</div>
            <select
              value={landscapeRegion}
              onChange={(e) => setLandscapeRegion(e.target.value as LandscapeRegion)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d9d9d9",
                fontSize: 14
              }}
            >
              <option value="all">All regions</option>
              <option value="west">West</option>
              <option value="midwest">Midwest</option>
              <option value="south">South</option>
              <option value="east">East</option>
            </select>

            <div style={{ fontSize: 12, color: "#666", marginTop: 10, lineHeight: 1.45 }}>
              Landscape polygons are filtered separately from camps, birds, hikes, highways, and targets.
            </div>
          </div>
        )}
      </div>

<div style={{ marginTop: 14 }}>
  <button
    onClick={() => setIsRegionsOpen((v) => !v)}
    style={{
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 16,
      fontWeight: 700,
      color: "#666"
    }}
  >
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>{isRegionsOpen ? "▼" : "▶"}</span>
      <span>Regions & States</span>
    </span>

    <span style={{ fontSize: 12, color: "#999", fontWeight: 600 }}>
      {stateFilterMode === "national"
        ? "nationwide"
        : states.length > 0
        ? `${states.length} selected`
        : "none selected"}
    </span>
  </button>

  {isRegionsOpen && (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10
        }}
      >
        <div style={{ fontSize: 12, color: "#666" }}>
          Nationwide shows all places; Select All allows filtered.
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 12, fontWeight: 700 }}>
          <button
            onClick={setNationwideStates}
            style={{
              background: "none",
              border: "none",
              color: "#188038",
              cursor: "pointer",
              padding: 0
            }}
          >
            Nationwide
          </button>

          <button
            onClick={selectAllStates}
            style={{
              background: "none",
              border: "none",
              color: "#1a73e8",
              cursor: "pointer",
              padding: 0
            }}
          >
            Select All
          </button>

          <button
            onClick={clearAllStates}
            style={{
              background: "none",
              border: "none",
              color: "#d93025",
              cursor: "pointer",
              padding: 0
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {Object.entries(STATE_GROUPS).map(([group, vals]) => {
        const isOpen = openGroups.includes(group);

        return (
          <div key={group} style={{ marginBottom: 10 }}>
            <button
              onClick={() =>
                setOpenGroups((prev) =>
                  prev.includes(group)
                    ? prev.filter((g) => g !== group)
                    : [...prev, group]
                )
              }
              style={{
                width: "100%",
                textAlign: "left",
                background: "#f7f7f7",
                border: "1px solid #e5e5e5",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 12,
                fontWeight: 700,
                color: "#444",
                cursor: "pointer"
              }}
            >
              {isOpen ? "▼" : "▶"} {group}
            </button>

            {isOpen && (
              <div
                style={{
                  paddingLeft: 10,
                  paddingTop: 8,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 4
                }}
              >
                <button
                  onClick={() => toggleStateGroup(group)}
                  style={{
                    gridColumn: "1 / -1",
                    background: "none",
                    border: "none",
                    color: "#1a73e8",
                    cursor: "pointer",
                    padding: "0 0 6px 0",
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: "left"
                  }}
                >
                  {vals.every((st) => states.includes(st))
                    ? `Clear ${group}`
                    : `Select ${group}`}
                </button>

                {vals.map((st) => (
                  <label
                    key={st}
                    style={{
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={states.includes(st)}
                      onChange={() => toggleState(st)}
                    />
                    {st}
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
            paddingTop: 12,
            borderTop: "1px solid #eee",
            fontSize: 11,
            color: "#666",
            lineHeight: 1.45
          }}
        >
          Choose categories, landscapes, and regions to display on the map. Close menu to view full map.
        </div>

        {(placeResults.length > 0 || highwayResults.length > 0) && (
          <div
            style={{
              marginTop: 12,
              borderTop: "1px solid #eee",
              paddingTop: 10
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6 }}>
              Search Results
            </div>

            {placeResults.map((p) => (
              <button
                key={`place-${p.id}`}
                onClick={() => {
                  setSearchQuery("");
                  triggerPlacePopup(p);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "#fff",
                  border: "1px solid #e6e6e6",
                  borderRadius: 6,
                  padding: "7px 8px",
                  marginBottom: 6,
                  cursor: "pointer"
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {p.state || "—"} · {p.place_type || "place"}
                </div>
              </button>
            ))}

            {highwayResults.map((h, idx) => (
              <div
                key={`highway-${idx}`}
                style={{
                  background: "#fff",
                  border: "1px solid #e6e6e6",
                  borderRadius: 6,
                  padding: "7px 8px",
                  marginBottom: 6
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>
                  {h.name}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {h.designats || h.subtype || "Highway"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )}
</div>

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
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            Route Builder
          </div>

          {routeStops.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
              Tap a place marker, then choose <b>Add Stop</b>.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {routeStops.map((stop, idx) => (
                  <div
                    key={stop.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      border: "1px solid #e5e5e5",
                      borderRadius: 6,
                      padding: "6px 8px"
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#777" }}>Stop {idx + 1}</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#222",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {stop.name}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setRouteStops((prev) => prev.filter((s) => s.id !== stop.id))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "#d93025",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={openRouteInGoogleMaps}
                  style={{
                    flex: 1,
                    background: "#188038",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Open Route
                </button>

                <button
                  onClick={() => setRouteStops([])}
                  style={{
                    background: "#f1f3f4",
                    color: "#333",
                    border: "1px solid #d0d0d0",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div id="map" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

