"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PortfolioMode = "top500" | "top1000";

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: any;
};

type LandscapeRow = {
  place_id: number;
  name: string;
  states: string | null;
  acres: number | null;
  owner_name: string | null;
  designation: string | null;
  landscape_features: number | null;
  ecosystems: number | null;
  human_footprint: number | null;
  ecoregion: string | null;
  ecoregion_rank: number | null;
  national_rank: number | null;
  rank_top500: number | null;
  in_top500: boolean;
  rank_top1000: number | null;
  in_top1000: boolean;
  geom: GeoJsonGeometry | string | null;
};

type EcoregionRow = {
  eco_id: number;
  eco_name: string | null;
  acres: number | null;
  geom: GeoJsonGeometry | string | null;
};

type PlaceEcosystemRow = {
  place_id: number;
  ecosystem: string | null;
  acres: number | null;
  percent: number | null;
};

function formatAcres(acres: number | null) {
  if (acres == null) return "—";
  return `${Math.round(acres).toLocaleString()} acres`;
}

function formatCompactAcres(acres: number | null) {
  if (acres == null) return "";
  return `${Math.round(acres).toLocaleString()} ac`;
}

function formatPercent(percent: number | null) {
  if (percent == null) return "—";
  return `${Math.round(percent)}%`;
}

function formatFootprint(value: number | null) {
  if (value == null) return "—";
  return Number(value).toFixed(3);
}

function escapeHtml(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseGeometry(
  input: GeoJsonGeometry | string | null | undefined
): GeoJsonGeometry | null {
  if (!input) return null;

  if (typeof input === "object") {
    if (
      (input.type === "Polygon" || input.type === "MultiPolygon") &&
      "coordinates" in input
    ) {
      return input as GeoJsonGeometry;
    }
    return null;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (
        parsed &&
        (parsed.type === "Polygon" || parsed.type === "MultiPolygon") &&
        parsed.coordinates
      ) {
        return parsed as GeoJsonGeometry;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function buildLandscapePopupHtml(
  row: LandscapeRow,
  mode: PortfolioMode,
  options?: {
    ecosystemsOpen?: boolean;
    ecosystemsLoading?: boolean;
    ecosystemsError?: string;
    ecosystems?: PlaceEcosystemRow[];
  }
) {
  const portfolioRank =
    mode === "top500" ? row.rank_top500 ?? "—" : row.rank_top1000 ?? "—";

  const ecosystemsOpen = options?.ecosystemsOpen ?? false;
  const ecosystemsLoading = options?.ecosystemsLoading ?? false;
  const ecosystemsError = options?.ecosystemsError ?? "";
  const ecosystems = options?.ecosystems ?? [];

  let ecosystemsSection = `
    <div style="margin-top:10px;">
      <button
        id="ecosystems-toggle-btn"
        data-place-id="${row.place_id}"
        style="
          border:1px solid #c7c7c7;
          border-radius:6px;
          padding:6px 10px;
          font-size:12px;
          background:#f5f5f5;
          cursor:pointer;
          color:#222;
          font-weight:600;
        "
      >
        See Ecosystems
      </button>
    </div>
  `;

  if (ecosystemsOpen) {
    let innerHtml = "";

    if (ecosystemsLoading) {
      innerHtml = `<div style="margin-top:8px; font-size:12px; color:#444;">Loading ecosystems...</div>`;
    } else if (ecosystemsError) {
      innerHtml = `<div style="margin-top:8px; font-size:12px; color:#c62828;">${escapeHtml(
        ecosystemsError
      )}</div>`;
    } else if (!ecosystems.length) {
      innerHtml = `<div style="margin-top:8px; font-size:12px; color:#444;">No ecosystems found for this place.</div>`;
    } else {
      innerHtml = `
        <div style="margin-top:8px; border-top:1px solid #eee; padding-top:8px;">
          <div style="font-size:12px; font-weight:700; "text-decoration: underline;"margin-bottom:6px; color:#222;">
            Top Ecosystems:
          </div>
          <div style="font-size:11.5px; line-height:1.45; color:#222;">
            ${ecosystems
              .map((eco, i) => {
                const acresText = eco.acres != null ? ` · ${formatCompactAcres(eco.acres)}` : "";
                return `
                  <div style="margin-bottom:${i === ecosystems.length - 1 ? 0 : 5}px;">
                    <span style="font-weight:600;">${escapeHtml(eco.ecosystem || "—")}</span>
                    <span style="color:#555;"> — ${escapeHtml(formatPercent(eco.percent))}${escapeHtml(acresText)}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    ecosystemsSection = `
      <div style="margin-top:10px;">
        <button
          id="ecosystems-toggle-btn"
          data-place-id="${row.place_id}"
          style="
            border:1px solid #c7c7c7;
            border-radius:6px;
            padding:6px 10px;
            font-size:12px;
            background:#eef3fb;
            cursor:pointer;
            color:#222;
            font-weight:700;
          "
        >
          Hide Ecosystems
        </button>
        ${innerHtml}
      </div>
    `;
  }

  return `
    <div style="padding:10px; font-family:sans-serif; min-width:260px; max-width:320px;">
      <div style="font-weight:700; font-size:15px; margin-bottom:8px;">
        ${escapeHtml(row.name)}
      </div>

      <div style="font-size:12px; line-height:1.55; color:#222;">
        <div><span style="font-weight:700;">States:</span> ${escapeHtml(row.states || "—")}</div>
        <div><span style="font-weight:700;">Acres:</span> ${escapeHtml(formatAcres(row.acres))}</div>
        <div><span style="font-weight:700;">Owner:</span> ${escapeHtml(row.owner_name || "—")}</div>
        <div><span style="font-weight:700;">Designation:</span> ${escapeHtml(row.designation || "—")}</div>
        <div><span style="font-weight:700;">Ecoregion:</span> ${escapeHtml(row.ecoregion || "—")}</div>
        <div><span style="font-weight:700;">Ecoregion Rank:</span> ${escapeHtml(row.ecoregion_rank ?? "—")}</div>
        <div><span style="font-weight:700;">Landscape Features:</span> ${escapeHtml(row.landscape_features ?? "—")}</div>
        <div><span style="font-weight:700;">Native Ecosystems:</span> ${escapeHtml(row.ecosystems ?? "—")}</div>
        <div><span style="font-weight:700;">Human Footprint:</span> ${escapeHtml(formatFootprint(row.human_footprint))}</div>
        <div><span style="font-weight:700;">${mode === "top500" ? "Top 500 Rank" : "Top 1000 Rank"}:</span> ${escapeHtml(portfolioRank)}</div>
        <div><span style="font-weight:300; font-style:italic;">Raw Ranking:</span> ${escapeHtml(row.national_rank ?? "—")}</div>
      </div>

      ${ecosystemsSection}
    </div>
  `;
}

function buildEcoregionPopupHtml(row: EcoregionRow) {
  return `
    <div style="padding:10px; font-family:sans-serif; min-width:220px; max-width:260px;">
      <div style="font-weight:700; font-size:15px; margin-bottom:8px;">
        ${escapeHtml(row.eco_name || "Ecoregion")}
      </div>
      <div style="font-size:12px; line-height:1.55; color:#222;">
        <div><span style="font-weight:700;">Acres:</span> ${escapeHtml(formatAcres(row.acres))}</div>
      </div>
    </div>
  `;
}

function getFeatureCenter(
  geometry: GeoJsonGeometry
): { lat: number; lng: number } | null {
  try {
    if (geometry.type === "Polygon") {
      const ring = geometry.coordinates?.[0];
      if (!Array.isArray(ring) || !ring.length) return null;

      let sumLng = 0;
      let sumLat = 0;
      let count = 0;

      for (const coord of ring) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        sumLng += Number(coord[0]);
        sumLat += Number(coord[1]);
        count += 1;
      }

      if (!count) return null;
      return { lat: sumLat / count, lng: sumLng / count };
    }

    if (geometry.type === "MultiPolygon") {
      const firstPoly = geometry.coordinates?.[0]?.[0];
      if (!Array.isArray(firstPoly) || !firstPoly.length) return null;

      let sumLng = 0;
      let sumLat = 0;
      let count = 0;

      for (const coord of firstPoly) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        sumLng += Number(coord[0]);
        sumLat += Number(coord[1]);
        count += 1;
      }

      if (!count) return null;
      return { lat: sumLat / count, lng: sumLng / count };
    }

    return null;
  } catch {
    return null;
  }
}

export default function LastGreatPlacesPage() {
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>("top500");
  const [rows, setRows] = useState<LandscapeRow[]>([]);
  const [ecoregions, setEcoregions] = useState<EcoregionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [showEcoregions, setShowEcoregions] = useState(false);

  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const landscapesLayerRef = useRef<any>(null);
  const ecoregionsLayerRef = useRef<any>(null);
  const hasFitBoundsRef = useRef(false);

  const popupPlaceRef = useRef<LandscapeRow | null>(null);
  const popupPositionRef = useRef<any>(null);
  const popupModeRef = useRef<PortfolioMode>("top500");
  const ecosystemsOpenRef = useRef(false);
  const ecosystemsLoadingRef = useRef(false);
  const ecosystemsErrorRef = useRef("");
  const ecosystemsCacheRef = useRef<Record<number, PlaceEcosystemRow[]>>({});
  const activePlaceIdRef = useRef<number | null>(null);

  const visibleRows = rows.filter((r) =>
    portfolioMode === "top500" ? r.in_top500 : r.in_top1000
  );

  const fitToUs = () => {
    if (!mapRef.current || !(window as any).google) return;

    const google = (window as any).google;
    const bounds = new google.maps.LatLngBounds(
      { lat: 24.0, lng: -125.0 },
      { lat: 49.5, lng: -66.5 }
    );

    mapRef.current.fitBounds(bounds);
  };

  const renderLandscapePopup = (
    row: LandscapeRow,
    position: any,
    mode: PortfolioMode
  ) => {
    if (!infoWindowRef.current || !mapRef.current) return;

    popupPlaceRef.current = row;
    popupPositionRef.current = position;
    popupModeRef.current = mode;

    const cached = ecosystemsCacheRef.current[row.place_id] ?? [];

    const html = buildLandscapePopupHtml(row, mode, {
      ecosystemsOpen: ecosystemsOpenRef.current,
      ecosystemsLoading: ecosystemsLoadingRef.current,
      ecosystemsError: ecosystemsErrorRef.current,
      ecosystems: ecosystemsOpenRef.current ? cached : [],
    });

    infoWindowRef.current.setContent(html);
    infoWindowRef.current.setPosition(position);
    infoWindowRef.current.open(mapRef.current);
  };

  const attachPopupButtonHandler = () => {
    window.setTimeout(() => {
      const btn = document.getElementById("ecosystems-toggle-btn");
      if (!btn) return;

      btn.onclick = async () => {
        const place = popupPlaceRef.current;
        const position = popupPositionRef.current;
        const mode = popupModeRef.current;

        if (!place || !position) return;

        if (ecosystemsOpenRef.current) {
          ecosystemsOpenRef.current = false;
          ecosystemsLoadingRef.current = false;
          ecosystemsErrorRef.current = "";
          renderLandscapePopup(place, position, mode);
          attachPopupButtonHandler();
          return;
        }

        ecosystemsOpenRef.current = true;
        ecosystemsLoadingRef.current = true;
        ecosystemsErrorRef.current = "";
        activePlaceIdRef.current = place.place_id;

        renderLandscapePopup(place, position, mode);
        attachPopupButtonHandler();

        if (!ecosystemsCacheRef.current[place.place_id]) {
          const result = await supabase
            .from("ecosystems_at_places")
            .select("place_id,ecosystem,acres,percent")
            .eq("place_id", place.place_id)
            .order("percent", { ascending: false, nullsFirst: false })
            .limit(5);

          if (activePlaceIdRef.current !== place.place_id) return;

          ecosystemsLoadingRef.current = false;

          if (result.error) {
            ecosystemsErrorRef.current =
              result.error.message || "Failed to load ecosystems.";
          } else {
            ecosystemsErrorRef.current = "";
            ecosystemsCacheRef.current[place.place_id] =
              (result.data as PlaceEcosystemRow[]) ?? [];
          }
        } else {
          ecosystemsLoadingRef.current = false;
        }

        renderLandscapePopup(place, position, mode);
        attachPopupButtonHandler();
      };
    }, 0);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg("");

      const [landscapeResult, ecoregionResult] = await Promise.all([
        supabase
          .from("whereto_top_portfolios_web")
          .select(
            "place_id,name,states,acres,owner_name,designation,landscape_features,ecosystems,human_footprint,ecoregion,ecoregion_rank,national_rank,rank_top500,in_top500,rank_top1000,in_top1000,geom"
          )
          .or("in_top500.eq.true,in_top1000.eq.true")
          .order("rank_top1000", { ascending: true, nullsFirst: false }),

        supabase
          .from("ecoregions_web_map")
          .select("eco_id,eco_name,acres,geom")
          .order("eco_id", { ascending: true }),
      ]);

      if (landscapeResult.error) {
        console.error(landscapeResult.error);
        setErrorMsg(landscapeResult.error.message || "Failed to load landscapes.");
        setRows([]);
        setLoading(false);
        return;
      }

      if (ecoregionResult.error) {
        console.error(ecoregionResult.error);
        setErrorMsg(ecoregionResult.error.message || "Failed to load ecoregions.");
        setRows((landscapeResult.data ?? []) as LandscapeRow[]);
        setEcoregions([]);
        setLoading(false);
        return;
      }

      setRows((landscapeResult.data ?? []) as LandscapeRow[]);
      setEcoregions((ecoregionResult.data ?? []) as EcoregionRow[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) {
      setErrorMsg("Missing Google Maps key.");
      return;
    }

    const existingScript = document.querySelector(
      `script[data-gmaps="last-great-places-page"]`
    );

    if (existingScript) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.dataset.gmaps = "last-great-places-page";
    script.onload = initMap;
    document.head.appendChild(script);

    function initMap() {
      const google = (window as any).google;
      if (!google || mapRef.current) return;

      const map = new google.maps.Map(
        document.getElementById("last-great-places-map") as HTMLElement,
        {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }
      );

      mapRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();

      infoWindowRef.current.addListener("closeclick", () => {
        popupPlaceRef.current = null;
        popupPositionRef.current = null;
        ecosystemsOpenRef.current = false;
        ecosystemsLoadingRef.current = false;
        ecosystemsErrorRef.current = "";
        activePlaceIdRef.current = null;
      });

      ecoregionsLayerRef.current = new google.maps.Data({ map });
      landscapesLayerRef.current = new google.maps.Data({ map });

      ecoregionsLayerRef.current.addListener("click", (event: any) => {
        const feature = event.feature;
        const props = feature.getProperty("row") as EcoregionRow | undefined;
        if (!props || !infoWindowRef.current) return;

        const html = buildEcoregionPopupHtml(props);

        let position = event.latLng;
        if (!position) {
          const geom = parseGeometry(props.geom);
          const center = geom ? getFeatureCenter(geom) : null;
          if (center) {
            position = new google.maps.LatLng(center.lat, center.lng);
          }
        }

        if (!position) return;

        popupPlaceRef.current = null;
        ecosystemsOpenRef.current = false;
        ecosystemsLoadingRef.current = false;
        ecosystemsErrorRef.current = "";
        activePlaceIdRef.current = null;

        infoWindowRef.current.setContent(html);
        infoWindowRef.current.setPosition(position);
        infoWindowRef.current.open(map);
      });

      landscapesLayerRef.current.addListener("click", (event: any) => {
        const feature = event.feature;
        const props = feature.getProperty("row") as LandscapeRow | undefined;
        if (!props || !infoWindowRef.current) return;

        let position = event.latLng;

        if (!position) {
          const geom = parseGeometry(props.geom);
          const center = geom ? getFeatureCenter(geom) : null;
          if (center) {
            position = new google.maps.LatLng(center.lat, center.lng);
          }
        }

        if (!position) return;

        ecosystemsOpenRef.current = false;
        ecosystemsLoadingRef.current = false;
        ecosystemsErrorRef.current = "";
        activePlaceIdRef.current = null;

        renderLandscapePopup(props, position, portfolioMode);
        attachPopupButtonHandler();
      });

      setMapReady(true);
      fitToUs();
    }
  }, [portfolioMode]);

  useEffect(() => {
    const google = (window as any).google;
    if (!mapReady || !google || !ecoregionsLayerRef.current) return;

    const ecoregionsLayer = ecoregionsLayerRef.current;

    ecoregionsLayer.forEach((feature: any) => {
      ecoregionsLayer.remove(feature);
    });

    if (!showEcoregions) {
      return;
    }

    const featureCollection = {
      type: "FeatureCollection",
      features: ecoregions
        .map((row) => {
          const geometry = parseGeometry(row.geom);
          if (!geometry) return null;

          return {
            type: "Feature",
            id: String(row.eco_id),
            properties: {
              eco_id: row.eco_id,
              row,
            },
            geometry,
          };
        })
        .filter(Boolean),
    };

    if (!featureCollection.features.length) return;

    ecoregionsLayer.addGeoJson(featureCollection as any);

    ecoregionsLayer.setStyle(() => {
      return {
        fillOpacity: 0,
        strokeColor: "#e57373",
        strokeWeight: 1.2,
        strokeOpacity: 0.75,
        clickable: true,
        zIndex: 1,
      };
    });
  }, [mapReady, ecoregions, showEcoregions]);

  useEffect(() => {
    const google = (window as any).google;
    if (!mapReady || !google || !landscapesLayerRef.current) return;

    const landscapesLayer = landscapesLayerRef.current;
    const map = mapRef.current;

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    popupPlaceRef.current = null;
    popupPositionRef.current = null;
    ecosystemsOpenRef.current = false;
    ecosystemsLoadingRef.current = false;
    ecosystemsErrorRef.current = "";
    activePlaceIdRef.current = null;

    landscapesLayer.forEach((feature: any) => {
      landscapesLayer.remove(feature);
    });

    const featureCollection = {
      type: "FeatureCollection",
      features: visibleRows
        .map((row) => {
          const geometry = parseGeometry(row.geom);
          if (!geometry) return null;

          return {
            type: "Feature",
            id: String(row.place_id),
            properties: {
              place_id: row.place_id,
              row,
            },
            geometry,
          };
        })
        .filter(Boolean),
    };

    if (!featureCollection.features.length) return;

    landscapesLayer.addGeoJson(featureCollection as any);

    landscapesLayer.setStyle(() => {
      const isTop500Mode = portfolioMode === "top500";

      return {
        fillColor: isTop500Mode ? "#2e7d32" : "#66bb6a",
        fillOpacity: 0.5,
        strokeColor: isTop500Mode ? "#1b5e20" : "#2e7d32",
        strokeWeight: 1.0,
        strokeOpacity: 1,
        clickable: true,
        zIndex: 3,
      };
    });

    if (!hasFitBoundsRef.current) {
      const bounds = new google.maps.LatLngBounds();

      for (const feature of featureCollection.features as any[]) {
        const geom = feature.geometry as GeoJsonGeometry;

        if (geom.type === "Polygon") {
          for (const ring of geom.coordinates) {
            for (const coord of ring) {
              bounds.extend({ lat: coord[1], lng: coord[0] });
            }
          }
        } else if (geom.type === "MultiPolygon") {
          for (const polygon of geom.coordinates) {
            for (const ring of polygon) {
              for (const coord of ring) {
                bounds.extend({ lat: coord[1], lng: coord[0] });
              }
            }
          }
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
        hasFitBoundsRef.current = true;
      }
    }
  }, [mapReady, visibleRows, portfolioMode]);

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        position: "relative",
        fontFamily: "sans-serif",
      }}
    >
      <a
        href="/"
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          zIndex: 12,
          background: "white",
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: "8px 12px",
          textDecoration: "none",
          color: "#333",
          fontWeight: 700,
          fontSize: 13,
          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
        }}
      >
        Home
      </a>

      {panelOpen ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 72,
            zIndex: 11,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 12,
            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 10,
              gap: 10,
              paddingRight: 4,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, color: "#222" }}>
              Last Great Places
            </div>

            <button
              onClick={() => setPanelOpen(false)}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                width: 30,
                height: 30,
                background: "#f5f5f5",
                cursor: "pointer",
                color: "#333",
                fontSize: 17,
                lineHeight: 1,
                fontWeight: 700,
                flexShrink: 0,
              }}
              aria-label="Close landscapes menu"
              title="Close landscapes menu"
            >
              ×
            </button>
          </div>

          <div
            style={{
              fontSize: 11.5,
              color: "#555",
              marginBottom: 10,
              lineHeight: 1.45,
            }}
          >
            A nationwide portfolio of public lands selected for
            geophysical diversity, ecosystem diversity, low human
            modification, conservation management & designation, and
            representation of America’s varied landscape features across
            68 ecoregions. Distinct selection rules capture high quality sites and diverse landscapes in
            all ecoregions.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <button
              onClick={() => setPortfolioMode("top500")}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "8px 0",
                fontSize: 12,
                cursor: "pointer",
                background: portfolioMode === "top500" ? "#1a73e8" : "white",
                color: portfolioMode === "top500" ? "white" : "#333",
                fontWeight: portfolioMode === "top500" ? 700 : 500,
              }}
            >
              Top 500
            </button>

            <button
              onClick={() => setPortfolioMode("top1000")}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "8px 0",
                fontSize: 12,
                cursor: "pointer",
                background: portfolioMode === "top1000" ? "#1a73e8" : "white",
                color: portfolioMode === "top1000" ? "white" : "#333",
                fontWeight: portfolioMode === "top1000" ? 700 : 500,
              }}
            >
              Top 1000
            </button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setShowEcoregions((prev) => !prev)}
              style={{
                width: "100%",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: showEcoregions ? "#eef3fb" : "#f8f8f8",
                color: "#333",
                fontWeight: showEcoregions ? 700 : 500,
              }}
            >
              {showEcoregions ? "Hide Ecoregions" : "Show Ecoregions"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <button
              onClick={fitToUs}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 11.5,
                cursor: "pointer",
                background: "#f5f5f5",
                color: "#333",
              }}
            >
              Reset Map
            </button>

            <div
              style={{
                fontSize: 11.5,
                color: "#555",
                alignSelf: "center",
              }}
            >
              Showing {visibleRows.length.toLocaleString()} places
            </div>
          </div>

          {loading && (
            <div style={{ fontSize: 12, marginBottom: 8 }}>Loading...</div>
          )}

          {errorMsg && (
            <div style={{ fontSize: 12, color: "#c62828", marginBottom: 8 }}>
              {errorMsg}
            </div>
          )}

          {!loading && !errorMsg && (
            <div
              style={{
                borderTop: "1px solid #eee",
                paddingTop: 10,
                fontSize: 11.5,
                color: "#444",
                lineHeight: 1.5,
              }}
            >
              Click a landscape polygon to view details. With ecoregions turned
              on, click within an ecoregion outline for its name and size.
              Close menu to see full map.
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            position: "absolute",
            left: 12,
            top: 72,
            zIndex: 11,
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "8px 12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
            fontWeight: 700,
            fontSize: 13,
            color: "#333",
            cursor: "pointer",
          }}
          aria-label="Show landscapes menu"
          title="Show landscapes menu"
        >
          Last Great Places
        </button>
      )}

      <div
        id="last-great-places-map"
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}