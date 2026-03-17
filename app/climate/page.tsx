"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type ClimateRow = {
  climdiv_id: string;
  state_abbr: string;
  state_list: string;
  division_name: string;
  month_name: string;
  tmax_f: number;
  tmin_f: number;
  mosquito_score: number;
};

type TravelLayerRow = {
  climdiv_id: string;
  state_abbr: string;
  division_name: string;
  month: number;
  travel_score: number;
  score_band: string;
  fill_color: string;
  geom_geojson: any;
};

type TravelLabel =
  | "Desirable"
  | "Acceptable"
  | "Undesirable"
  | "Unacceptable";

type TravelComponent = {
  label: TravelLabel;
  score: number;
};

const MONTHS = [
  { num: 1, label: "Jan" },
  { num: 2, label: "Feb" },
  { num: 3, label: "Mar" },
  { num: 4, label: "Apr" },
  { num: 5, label: "May" },
  { num: 6, label: "Jun" },
  { num: 7, label: "Jul" },
  { num: 8, label: "Aug" },
  { num: 9, label: "Sep" },
  { num: 10, label: "Oct" },
  { num: 11, label: "Nov" },
  { num: 12, label: "Dec" },
];

const CONUS_STATES = [
  "AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
  "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function getMosquitoCategory(score: number) {
  if (score <= 2.4) return { label: "Very Low", color: "#2e7d32" };
  if (score <= 4.4) return { label: "Low", color: "#558b2f" };
  if (score <= 6.4) return { label: "Moderate", color: "#f9a825" };
  if (score <= 8.4) return { label: "High", color: "#ef6c00" };
  return { label: "Very High", color: "#c62828" };
}

function getTravelColor(label: TravelLabel) {
  switch (label) {
    case "Desirable":
      return "#2e7d32";
    case "Acceptable":
      return "#1565c0";
    case "Undesirable":
      return "#ef6c00";
    case "Unacceptable":
      return "#c62828";
    default:
      return "#333";
  }
}

function formatTravelScore(score: number) {
  return Math.max(0, Math.min(10, score)).toFixed(1);
}

function getDayRating(temp: number): TravelComponent {
  if (temp < 25) return { label: "Unacceptable", score: 0 };
  if (temp <= 34) return { label: "Undesirable", score: 1 };
  if (temp <= 44) return { label: "Acceptable", score: 2 };
  if (temp <= 54) return { label: "Acceptable", score: 2 };
  if (temp <= 64) return { label: "Desirable", score: 3 };
  if (temp <= 69) return { label: "Desirable", score: 3 };
  if (temp <= 74) return { label: "Acceptable", score: 2 };
  if (temp <= 79) return { label: "Acceptable", score: 2 };
  if (temp <= 84) return { label: "Undesirable", score: 1 };
  return { label: "Unacceptable", score: 0 };
}

function getNightRating(temp: number): TravelComponent {
  if (temp < 25) return { label: "Unacceptable", score: 0 };
  if (temp <= 34) return { label: "Undesirable", score: 1 };
  if (temp <= 44) return { label: "Acceptable", score: 2 };
  if (temp <= 54) return { label: "Acceptable", score: 2 };
  if (temp <= 64) return { label: "Desirable", score: 3 };
  if (temp <= 69) return { label: "Acceptable", score: 2 };
  if (temp <= 74) return { label: "Undesirable", score: 1 };
  return { label: "Unacceptable", score: 0 };
}

function getMosquitoTravelRating(mosquitoScore: number): TravelComponent {
  const mosq = getMosquitoCategory(mosquitoScore);

  switch (mosq.label) {
    case "Very Low":
      return { label: "Desirable", score: 3 };
    case "Low":
      return { label: "Desirable", score: 3 };
    case "Moderate":
      return { label: "Acceptable", score: 2 };
    case "High":
      return { label: "Undesirable", score: 1 };
    case "Very High":
      return { label: "Unacceptable", score: 0 };
    default:
      return { label: "Acceptable", score: 2 };
  }
}

function computeTravelScore(r: ClimateRow) {
  const day = getDayRating(Number(r.tmax_f));
  const night = getNightRating(Number(r.tmin_f));
  const mosquito = getMosquitoTravelRating(Number(r.mosquito_score));

  const rawTotal = day.score + night.score + mosquito.score;
  let travelScore = (rawTotal * 10) / 9;

  const unacceptableCount = [day, night, mosquito].filter(
    (x) => x.label === "Unacceptable"
  ).length;

  if (unacceptableCount === 1) {
    travelScore -= 1.5;
  } else if (unacceptableCount === 2) {
    travelScore -= 3.0;
  } else if (unacceptableCount === 3) {
    travelScore = 0;
  }

  travelScore = Math.max(0, Math.min(10, travelScore));

  return {
    day,
    night,
    mosquito,
    rawTotal,
    travelScore,
  };
}

export default function ClimatePage() {
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [results, setResults] = useState<ClimateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [clickedLatLng, setClickedLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const [showTravelLayer, setShowTravelLayer] = useState(false);
  const [layerState, setLayerState] = useState<string>("");
  const [layerMonth, setLayerMonth] = useState<number | "">("");

  const selectedMonthsRef = useRef<number[]>([]);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const travelPolygonsRef = useRef<any[]>([]);

  useEffect(() => {
    selectedMonthsRef.current = selectedMonths;
  }, [selectedMonths]);

  const toggleMonth = (monthNum: number) => {
    setSelectedMonths((prev) =>
      prev.includes(monthNum)
        ? prev.filter((m) => m !== monthNum)
        : [...prev, monthNum].sort((a, b) => a - b)
    );
  };

  const clearTravelLayer = () => {
    travelPolygonsRef.current.forEach((p) => p.setMap(null));
    travelPolygonsRef.current = [];
  };

  const clearAll = () => {
    setSelectedMonths([]);
    setResults([]);
    setClickedLatLng(null);
    setErrorMsg("");
    setLoading(false);

    setShowTravelLayer(false);
    setLayerState("");
    setLayerMonth("");
    clearTravelLayer();

    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
  };

  const fetchClimate = async (lat: number, lng: number, months: number[]) => {
    if (!months.length) {
      setErrorMsg("Select at least one month.");
      setResults([]);
      if (infoWindowRef.current) infoWindowRef.current.close();
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.rpc(
      "get_climate_and_mosquito_at_point_months",
      {
        p_lat: lat,
        p_lon: lng,
        p_months: months,
      }
    );

    if (error) {
      console.error(error);
      setErrorMsg(error.message || "Failed to fetch climate data.");
      setResults([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ClimateRow[];
    setResults(rows);
    setLoading(false);

    if (infoWindowRef.current && mapRef.current) {
      if (!rows.length) {
        infoWindowRef.current.setContent(`
          <div style="padding:10px; font-family:sans-serif;">
            <b>No climate division found</b><br/>
            <span style="font-size:12px; color:#555;">Try clicking again.</span>
          </div>
        `);
        infoWindowRef.current.setPosition({ lat, lng });
        infoWindowRef.current.open(mapRef.current);
        return;
      }

      const header = `<div style="font-weight:700; margin-bottom:8px;">${rows[0].state_list || rows[0].state_abbr} — ${rows[0].division_name}</div>`;

      const body = rows
        .map((r) => {
          const mosq = getMosquitoCategory(Number(r.mosquito_score));
          const travel = computeTravelScore(r);

          return `
            <div style="font-size:12px; line-height:1.5; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #f0f0f0;">
              <div style="font-weight:700;">${r.month_name}</div>

              <div>Early: ${r.tmax_f - 6}° / ${r.tmin_f - 6}°</div>
              <div>Mid: ${r.tmax_f}° / ${r.tmin_f}°</div>
              <div>Late: ${r.tmax_f + 6}° / ${r.tmin_f + 6}°</div>

              <div style="margin-top:4px; font-weight:700; color:${mosq.color};">
                Mosquito Risk: ${mosq.label}
              </div>

              <div style="margin-top:6px; padding-top:6px; border-top:1px solid #f6f6f6;">
                <div>
                  Day:
                  <span style="font-weight:700; color:${getTravelColor(travel.day.label)};">
                    ${travel.day.label}
                  </span>
                </div>
                <div>
                  Night:
                  <span style="font-weight:700; color:${getTravelColor(travel.night.label)};">
                    ${travel.night.label}
                  </span>
                </div>
                <div>
                  Mosquito:
                  <span style="font-weight:700; color:${getTravelColor(travel.mosquito.label)};">
                    ${travel.mosquito.label}
                  </span>
                </div>
                <div style="margin-top:4px; font-size:13px;">
                  <span style="font-weight:700;">Travel Score:</span>
                  <span style="font-weight:700; color:#1565c0;"> ${formatTravelScore(travel.travelScore)} / 10</span>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      infoWindowRef.current.setContent(`
        <div style="padding:10px; font-family:sans-serif; min-width:240px; max-width:280px;">
          ${header}
          ${body}
        </div>
      `);
      infoWindowRef.current.setPosition({ lat, lng });
      infoWindowRef.current.open(mapRef.current);
    }
  };

  const addPolygonFeature = (
    google: any,
    map: any,
    geometry: any,
    row: TravelLayerRow
  ) => {
    const createPolygon = (paths: any[]) => {
      const poly = new google.maps.Polygon({
        paths,
        strokeColor: "#555",
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: row.fill_color,
        fillOpacity: 0.45,
        map,
        zIndex: 1,
      });

      poly.addListener("click", (e: any) => {
        if (!infoWindowRef.current) return;
        infoWindowRef.current.setContent(`
          <div style="padding:10px; font-family:sans-serif; min-width:180px;">
            <div style="font-weight:700; margin-bottom:4px;">${row.state_abbr} — ${row.division_name}</div>
            <div style="font-size:12px;">Travel Score: <b>${Number(row.travel_score).toFixed(1)} / 10</b></div>
            <div style="font-size:12px; margin-top:2px;">Band: <b>${row.score_band}</b></div>
          </div>
        `);
        infoWindowRef.current.setPosition(e.latLng);
        infoWindowRef.current.open(map);
      });

      travelPolygonsRef.current.push(poly);
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

  const loadTravelLayer = async () => {
    clearTravelLayer();

    if (!showTravelLayer || !layerState || !layerMonth || !mapRef.current) return;

    const google = (window as any).google;
    if (!google) return;

    const { data, error } = await supabase.rpc("get_state_travel_score_layer", {
      p_state: layerState,
      p_month: layerMonth,
    });

    if (error) {
      console.error("Travel layer error:", error);
      return;
    }

    const rows = (data ?? []) as TravelLayerRow[];
    rows.forEach((row) => {
      addPolygonFeature(google, mapRef.current, row.geom_geojson, row);
    });
  };

  useEffect(() => {
    loadTravelLayer();
  }, [showTravelLayer, layerState, layerMonth]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) return;

    const existingScript = document.querySelector(
      `script[data-gmaps="climate-page"]`
    );
    if (existingScript) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.dataset.gmaps = "climate-page";
    script.onload = initMap;
    document.head.appendChild(script);

    function initMap() {
      const google = (window as any).google;
      if (!google || mapRef.current) return;

      const map = new google.maps.Map(
        document.getElementById("climate-map") as HTMLElement,
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

      map.addListener("click", async (e: any) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();

        setClickedLatLng({ lat, lng });

        if (!markerRef.current) {
          markerRef.current = new google.maps.Marker({
            map,
            position: { lat, lng },
          });
        } else {
          markerRef.current.setPosition({ lat, lng });
        }

        await fetchClimate(lat, lng, selectedMonthsRef.current);
      });
    }
  }, []);

  useEffect(() => {
    if (clickedLatLng && selectedMonths.length) {
      fetchClimate(clickedLatLng.lat, clickedLatLng.lng, selectedMonths);
    } else if (!selectedMonths.length) {
      setResults([]);
      setErrorMsg("");
      if (infoWindowRef.current) infoWindowRef.current.close();
    }
  }, [selectedMonths]);

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

      <a
  href="/lastgreatplaces"
  style={{
    position: "absolute",
    right: 12,
    top: 58,
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
  Landscapes
</a>

      {panelOpen ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 72,
            zIndex: 11,
            width: "min(340px, calc(100vw - 24px))",
maxWidth: "calc(100vw - 24px)",
maxHeight: "calc(100vh - 96px)",
overflowY: "auto",
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
              Climate Map
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
              aria-label="Close climate menu"
              title="Close climate menu"
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.4 }}>
            Select month(s), then move map to desired location and click. Close menu on phone to see full map.
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 8,
            }}
          >
            <button
              onClick={clearAll}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: "#f5f5f5",
                color: "#333",
              }}
            >
              Clear
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {MONTHS.map((m) => {
              const selected = selectedMonths.includes(m.num);
              return (
                <button
                  key={m.num}
                  onClick={() => toggleMonth(m.num)}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    padding: "8px 0",
                    fontSize: 12,
                    cursor: "pointer",
                    background: selected ? "#1a73e8" : "white",
                    color: selected ? "white" : "#333",
                    fontWeight: selected ? 700 : 400,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Travel Score Layer Enhancements */}
          <div
            style={{
              borderTop: "1px solid #eee",
              paddingTop: 10,
              marginTop: 4,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#333" }}>
              Travel Score Layer
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showTravelLayer}
                onChange={(e) => setShowTravelLayer(e.target.checked)}
              />
              Show state travel score shading
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>
                  State
                </div>
                <select
                  value={layerState}
                  onChange={(e) => setLayerState(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 12,
                    background: "white",
                  }}
                >
                  <option value="">Select state</option>
                  {CONUS_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>
                  Month
                </div>
                <select
                  value={layerMonth}
                  onChange={(e) =>
                    setLayerMonth(e.target.value ? Number(e.target.value) : "")
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 12,
                    background: "white",
                  }}
                >
                  <option value="">Select month</option>
                  {MONTHS.map((m) => (
                    <option key={m.num} value={m.num}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#666",
                lineHeight: 1.4,
              }}
            >
              Map colors: 8–10 dark green, 6–8 light green, 4–6 yellow, 2–4 orange, 0–2 red.
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

          {clickedLatLng && (
            <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
              Clicked: {clickedLatLng.lat.toFixed(3)},{" "}
              {clickedLatLng.lng.toFixed(3)}
            </div>
          )}

          {results.length > 0 && (
  <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
    <div
      style={{
        fontWeight: 700,
        marginBottom: 6,
        lineHeight: 1.35,
        wordBreak: "break-word",
      }}
    >
      {results[0].state_list || results[0].state_abbr} — {results[0].division_name}
    </div>

    <div style={{ display: "grid", gap: 8, maxHeight: "40vh", overflowY: "auto", paddingRight: 4 }}>
      {results.map((r) => {
        const mosq = getMosquitoCategory(Number(r.mosquito_score));
        const travel = computeTravelScore(r);

        return (
          <div
            key={r.month_name}
            style={{
              fontSize: 12,
              padding: "6px 0",
              borderBottom: "1px solid #f3f3f3",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {r.month_name}
            </div>

            <div>
              Early&nbsp;&nbsp; High {r.tmax_f - 6}° &nbsp;&nbsp; Low{" "}
              {r.tmin_f - 6}°
            </div>
            <div>
              Mid&nbsp;&nbsp;&nbsp;&nbsp; High {r.tmax_f}° &nbsp;&nbsp;
              Low {r.tmin_f}°
            </div>
            <div>
              Late&nbsp;&nbsp;&nbsp; High {r.tmax_f + 6}° &nbsp;&nbsp;
              Low {r.tmin_f + 6}°
            </div>

            <div
              style={{
                marginTop: 4,
                fontWeight: 700,
                color: mosq.color,
              }}
            >
              Mosquito Risk: {mosq.label}
            </div>

            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #f7f7f7" }}>
              <div>
                Day:{" "}
                <span
                  style={{
                    fontWeight: 700,
                    color: getTravelColor(travel.day.label),
                  }}
                >
                  {travel.day.label}
                </span>
              </div>
              <div>
                Night:{" "}
                <span
                  style={{
                    fontWeight: 700,
                    color: getTravelColor(travel.night.label),
                  }}
                >
                  {travel.night.label}
                </span>
              </div>
              <div>
                Mosquito:{" "}
                <span
                  style={{
                    fontWeight: 700,
                    color: getTravelColor(travel.mosquito.label),
                  }}
                >
                  {travel.mosquito.label}
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontWeight: 700 }}>Travel Score:</span>{" "}
                <span style={{ fontWeight: 700, color: "#1565c0" }}>
                  {formatTravelScore(travel.travelScore)} / 10
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}

          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid #eee",
              fontSize: 11,
              color: "#666",
              lineHeight: 1.4,
            }}
          >
            Mosquito risk is a climate-based monthly estimate, not a real-time
            forecast based on local conditions & habitats. Average temperatures
            do not reflect elevation differences in western states. Travel score
            ratings are experimental.
          </div>
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
          aria-label="Show climate menu"
          title="Show climate menu"
        >
          Climate
        </button>
      )}

      <div id="climate-map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}