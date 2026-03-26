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
  ecoregion: string | null;
  ecoregion_rank: number | null;
  national_rank: number | null;
  rank_top500: number | null;
  in_top500: boolean;
  rank_top1000: number | null;
  in_top1000: boolean;
  geom: GeoJsonGeometry | string | null;
};

function formatAcres(acres: number | null) {
  if (acres == null) return "—";
  return `${Math.round(acres).toLocaleString()} acres`;
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

function parseGeometry(input: LandscapeRow["geom"]): GeoJsonGeometry | null {
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

function buildPopupHtml(row: LandscapeRow, mode: PortfolioMode) {
  const portfolioRank =
    mode === "top500" ? row.rank_top500 ?? "—" : row.rank_top1000 ?? "—";

  return `
    <div style="padding:10px; font-family:sans-serif; min-width:240px; max-width:280px;">
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
       
        <div><span style="font-weight:700;">${mode === "top500" ? "Top 500 Rank" : "Top 1000 Rank"}:</span> ${escapeHtml(portfolioRank)}</div>
       <div><span style="font-weight:300;">Raw National Rank 7100 Candidate Areas:</span> ${escapeHtml(row.national_rank ?? "—")}</div>
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
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);

  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const dataLayerRef = useRef<any>(null);
  const hasFitBoundsRef = useRef(false);

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

  useEffect(() => {
    const fetchLandscapes = async () => {
      setLoading(true);
      setErrorMsg("");

      const { data, error } = await supabase
        .from("whereto_top_portfolios_web")
        .select(
          "place_id,name,states,acres,owner_name,designation,ecoregion,ecoregion_rank,national_rank,rank_top500,in_top500,rank_top1000,in_top1000,geom"
        )
        .or("in_top500.eq.true,in_top1000.eq.true")
        .order("rank_top1000", { ascending: true, nullsFirst: false });

      if (error) {
        console.error(error);
        setErrorMsg(error.message || "Failed to load landscapes.");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as LandscapeRow[]);
      setLoading(false);
    };

    fetchLandscapes();
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
      dataLayerRef.current = new google.maps.Data({ map });

      dataLayerRef.current.addListener("click", (event: any) => {
        const feature = event.feature;
        const props = feature.getProperty("row") as LandscapeRow | undefined;
        if (!props || !infoWindowRef.current) return;

        const html = buildPopupHtml(props, portfolioMode);

        let position = event.latLng;

        if (!position) {
          const geom = parseGeometry(props.geom);
          const center = geom ? getFeatureCenter(geom) : null;
          if (center) {
            position = new google.maps.LatLng(center.lat, center.lng);
          }
        }

        if (!position) return;

        infoWindowRef.current.setContent(html);
        infoWindowRef.current.setPosition(position);
        infoWindowRef.current.open(map);
      });

      setMapReady(true);
      fitToUs();
    }
  }, []);

  useEffect(() => {
    const google = (window as any).google;
    if (!mapReady || !google || !dataLayerRef.current) return;

    const dataLayer = dataLayerRef.current;
    const map = mapRef.current;

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    dataLayer.forEach((feature: any) => {
      dataLayer.remove(feature);
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

    dataLayer.addGeoJson(featureCollection as any);

    dataLayer.setStyle(() => {
      const isTop500Mode = portfolioMode === "top500";

      return {
        fillColor: isTop500Mode ? "#2e7d32" : "#66bb6a",
        fillOpacity: isTop500Mode ? 0.5 : 0.5,
        strokeColor: isTop500Mode ? "#1b5e20" : "#2e7d32",
        strokeWeight: isTop500Mode ? 1.0 : 1.0,
        strokeOpacity: 1,
        clickable: true,
        zIndex: isTop500Mode ? 3 : 2,
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
          padding: "10px 14px",
          textDecoration: "none",
          color: "#333",
          fontWeight: 700,
          fontSize: 14,
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
            width: 350,
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
            <div style={{ fontWeight: 700, fontSize: 16, color: "#222" }}>
              Last Great Places
            </div>

            <button
              onClick={() => setPanelOpen(false)}
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
              fontSize: 12,
              color: "#555",
              marginBottom: 10,
              lineHeight: 1.45,
            }}
          >
            A nationwide portfolio of public lands selected
            for landscape diversity, ecosystem diversity, low human modification, conservation management and designation,
            and representation of America’s varied landscape features across 68 ecoregions. Top 500 and Top 1000
              use distinct selection rules to capture high quality sites and landscape diversity within ecoregions.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <button
              onClick={() => setPortfolioMode("top500")}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "10px 0",
                fontSize: 13,
                cursor: "pointer",
                background: portfolioMode === "top500" ? "#1a73e8" : "white",
                color: portfolioMode === "top500" ? "white" : "#333",
                fontWeight: portfolioMode === "top500" ? 700 : 400,
              }}
            >
              Top 500
            </button>

            <button
              onClick={() => setPortfolioMode("top1000")}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "10px 0",
                fontSize: 13,
                cursor: "pointer",
                background: portfolioMode === "top1000" ? "#1a73e8" : "white",
                color: portfolioMode === "top1000" ? "white" : "#333",
                fontWeight: portfolioMode === "top1000" ? 700 : 400,
              }}
            >
              Top 1000
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
                padding: "8px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: "#f5f5f5",
                color: "#333",
              }}
            >
              Reset Map
            </button>

            <div
              style={{
                fontSize: 12,
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
                fontSize: 12,
                color: "#444",
                lineHeight: 1.5,
              }}
            >
              Click a landscape polygon to view details. 
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
            padding: "10px 14px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
            fontWeight: 700,
            fontSize: 14,
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