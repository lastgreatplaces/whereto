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
  default: { color: "#607d8b", emoji: "⛺" },
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
};

const UI_CAMP_SUBTYPES = [
  "COE",
  "NF",
  "NP",
  "SP",
  "SF",
  "BLM",
  "BD",
  "NRA",
  "CP",
  "SFW",
  "RES",
];

const UI_HIGHWAY_SUBTYPES = ["Scenic", "Backcountry"];

const STATE_GROUPS: Record<string, string[]> = {
  South: [
    "AL",
    "AR",
    "FL",
    "GA",
    "KY",
    "LA",
    "MS",
    "NC",
    "OK",
    "SC",
    "TN",
    "TX",
    "VA",
    "WV",
  ],
  East: [
    "CT",
    "DE",
    "ME",
    "MD",
    "MA",
    "NH",
    "NJ",
    "NY",
    "PA",
    "RI",
    "VT",
  ],
  Midwest: [
    "IL",
    "IN",
    "IA",
    "KS",
    "MI",
    "MN",
    "MO",
    "NE",
    "ND",
    "OH",
    "SD",
    "WI",
  ],
  West: [
    "AK",
    "AZ",
    "CA",
    "CO",
    "ID",
    "MT",
    "NV",
    "NM",
    "OR",
    "UT",
    "WA",
    "WY",
  ],
  Canada: ["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"],
};

export default function Home() {
  const [states, setStates] = useState<string[]>([]);
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>([]);
  const [selectedCampSubtypes, setSelectedCampSubtypes] = useState<string[]>([]);
  const [selectedHighwaySubtypes, setSelectedHighwaySubtypes] = useState<
    string[]
  >([]);
  const [favOnlyCategories, setFavOnlyCategories] = useState<PlaceType[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [isCampSubmenuOpen, setIsCampSubmenuOpen] = useState(false);
  const [isHighwaySubmenuOpen, setIsHighwaySubmenuOpen] = useState(false);

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
    highwaySubtypes: new Set<string>(selectedHighwaySubtypes),
    favOnlyCategories: new Set<PlaceType>(favOnlyCategories),
  });

  useEffect(() => {
    filtersRef.current.states = new Set(states);
    filtersRef.current.types = new Set(placeTypes);
    filtersRef.current.campSubtypes = new Set(selectedCampSubtypes);
    filtersRef.current.highwaySubtypes = new Set(selectedHighwaySubtypes);
    filtersRef.current.favOnlyCategories = new Set(favOnlyCategories);
  }, [
    states,
    placeTypes,
    selectedCampSubtypes,
    selectedHighwaySubtypes,
    favOnlyCategories,
  ]);

  const getMarkerStyle = (
    google: any,
    type: PlaceType,
    subtype: string,
    zoom: number,
    isFavorite: boolean
  ) => {
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
        labelOrigin: new google.maps.Point(0, 0),
      };
    }

    if (type === "hikes") {
      return {
        path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z",
        scale: baseSize / 20,
        fillColor: "#28a745",
        fillOpacity: 1,
        strokeWeight,
        strokeColor,
      };
    }

    const theme = CAMP_THEMES[subtype] || CAMP_THEMES["default"];

    return {
      path: "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1 1 10,-30 C 10,-22 2,-20 0,0 z",
      scale: baseSize / 16,
      fillColor: theme.color,
      fillOpacity: 1,
      strokeWeight,
      strokeColor,
      labelOrigin: new google.maps.Point(0, -30),
    };
  };

  const applyMarkerSizing = () => {
    if (!mapRef.current) return;

    const google = (window as any).google;
    const z = mapRef.current.getZoom() ?? 4;

    markersMapRef.current.forEach((m) => {
      const type = (m as any).__type as PlaceType;
      const isFav = (m as any).__isFavorite;

      m.setIcon(
        getMarkerStyle(google, type, (m as any).__subtype, z, isFav)
      );

      if (type === "birds") {
        m.setLabel({
          text: "🦅",
          fontSize: z <= 8 ? "18px" : "26px",
          color: "black",
          fontWeight: "700",
        });
      } else {
        m.setLabel(
          z > 7
            ? {
                text: (m as any).__emoji,
                fontSize: z <= 11 ? "14px" : "18px",
                color: "white",
                fontWeight: "700",
              }
            : null
        );
      }
    });
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

    if (!key) return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;

    const clusterScript = document.createElement("script");
    clusterScript.src =
      "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";

    script.onload = () => {
      document.head.appendChild(clusterScript);

      clusterScript.onload = () => {
        const google = (window as any).google;

        const map = new google.maps.Map(
          document.getElementById("map") as HTMLElement,
          {
            center: { lat: 39.5, lng: -98.35 },
            zoom: 4,
            mapTypeControl: false,
            streetViewControl: false,
          }
        );

        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();

        clustererRef.current = new (window as any).markerClusterer.MarkerClusterer(
          { map, algorithmOptions: { maxZoom: 9, gridSize: 60 } }
        );

        map.addListener("zoom_changed", applyMarkerSizing);
      };
    };

    document.head.appendChild(script);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "sans-serif",
      }}
    >

      {/* CLIMATE MAP BUTTON */}

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
          padding: "10px 14px",
          textDecoration: "none",
          color: "#333",
          fontWeight: 700,
          fontSize: "13px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        Climate Map
      </a>

      {/* FILTER PANEL */}

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
        }}
      >
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          style={{
            width: "100%",
            cursor: "pointer",
            padding: "4px",
            marginBottom: isFilterOpen ? 8 : 0,
          }}
        >
          {isFilterOpen ? "Close Filters" : "☰"}
        </button>
      </div>

      <div id="map" style={{ height: "100%", width: "100%" }} />

    </div>
  );
}