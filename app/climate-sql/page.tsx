"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type ClimateSqlRow = {
  climdiv_id: string;
  state_abbr: string;
  division_name: string;
  month: number;
  month_name: string;
  tmax_f: number;
  tmin_f: number;
  precip: number;
  mosquito_score: number;
  day_label: string;
  night_label: string;
  precip_label: string;
  mosquito_label: string;
  mosquito_label_display?: string;
  travel_score: number;
  score_band: string;
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

const MONTH_LABEL_BY_NUM: Record<number, string> = Object.fromEntries(
  MONTHS.map((m) => [m.num, m.label])
);

const US_STATES = [
  "AK","AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
  "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

const CANADA_PROVINCES = [
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"
];

function getMosquitoCategory(score: number) {
  if (score <= 2.4) return { label: "Very Low", color: "#2e7d32" };
  if (score <= 4.4) return { label: "Low", color: "#558b2f" };
  if (score <= 6.4) return { label: "Moderate", color: "#d18203" };
  if (score <= 8.4) return { label: "High", color: "#ef6c00" };
  return { label: "Very High", color: "#c62828" };
}

function getTravelColor(label: string) {
  switch (label) {
    case "Optimal":
      return "#0e5711";
    case "Desirable":
      return "#38823b";
    case "Acceptable":
      return "#1565c0";
    case "Undesirable":
      return "#ef6c00";
    case "Unacceptable":
      return "#c62828";
    case "minor factor":
      return "#4e4d4d";
    case "n/a most areas":
      return "#4e4d4d";
    default:
      return "#333";
  }
}

function formatTravelScore(score: number) {
  return Math.max(0, Math.min(10, score)).toFixed(1);
}

function getMonthPhaseTemps(monthNum: number, tmax: number, tmin: number) {
  let earlyOffset = 0;
  let lateOffset = 0;

  switch (monthNum) {
    // winter / summer: minimal intra-month change
    case 1:
    case 2:
      earlyOffset = -1;
      lateOffset = 1;
      break;

    case 7:
    case 8:
      earlyOffset = 1;
      lateOffset = -1;
      break;

    // shoulder months: moderate change
    case 3:
    case 6:
      earlyOffset = -3;
      lateOffset = 3;
      break;

    case 9:
    case 12:
      earlyOffset = 3;
      lateOffset = -3;
      break;

    // peak transition months: strongest change
    case 4:
    case 5:
      earlyOffset = -5;
      lateOffset = 5;
      break;

    case 10:
    case 11:
      earlyOffset = 5;
      lateOffset = -5;
      break;

    default:
      earlyOffset = 0;
      lateOffset = 0;
  }

  return {
    earlyMax: Math.round(tmax + earlyOffset),
    earlyMin: Math.round(tmin + earlyOffset),
    midMax: Math.round(tmax),
    midMin: Math.round(tmin),
    lateMax: Math.round(tmax + lateOffset),
    lateMin: Math.round(tmin + lateOffset),
  };
}

export default function ClimateSqlPage() {
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [results, setResults] = useState<ClimateSqlRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [clickedLatLng, setClickedLatLng] = useState<{ lat: number; lng: number } | null>(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [travelSectionOpen, setTravelSectionOpen] = useState(false);
  const [statesSectionOpen, setStatesSectionOpen] = useState(true);
  const [provincesSectionOpen, setProvincesSectionOpen] = useState(true);

  const [selectedLayerStates, setSelectedLayerStates] = useState<string[]>([]);
  const [selectedLayerProvinces, setSelectedLayerProvinces] = useState<string[]>([]);
  const [activeLayerMonth, setActiveLayerMonth] = useState<number | null>(null);

  const selectedMonthsRef = useRef<number[]>([]);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const travelPolygonsRef = useRef<any[]>([]);

  useEffect(() => {
    selectedMonthsRef.current = selectedMonths;
  }, [selectedMonths]);

  const selectedLayerMonthOptions = useMemo(
    () => selectedMonths.map((m) => ({ num: m, label: MONTH_LABEL_BY_NUM[m] })),
    [selectedMonths]
  );

  const allSelectedRegions = useMemo(
    () => [...selectedLayerStates, ...selectedLayerProvinces],
    [selectedLayerStates, selectedLayerProvinces]
  );

  useEffect(() => {
    if (!selectedMonths.length) {
      setActiveLayerMonth(null);
      return;
    }

    if (activeLayerMonth == null || !selectedMonths.includes(activeLayerMonth)) {
      setActiveLayerMonth(selectedMonths[selectedMonths.length - 1]);
    }
  }, [selectedMonths, activeLayerMonth]);

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

    setSelectedLayerStates([]);
    setSelectedLayerProvinces([]);
    setActiveLayerMonth(null);
    setTravelSectionOpen(false);
    setStatesSectionOpen(true);
    setProvincesSectionOpen(true);

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
      "get_climate_and_travel_sql_at_point_months",
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

    const rows = (data ?? []) as ClimateSqlRow[];
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

      const header = `<div style="font-weight:700; margin-bottom:8px;">${rows[0].state_abbr} — ${rows[0].division_name}</div>`;

      const body = rows
        .map((r) => {
          const mosq = getMosquitoCategory(Number(r.mosquito_score));
          const mosquitoDisplay = r.mosquito_label_display || r.mosquito_label;
          const temps = getMonthPhaseTemps(
            Number(r.month),
            Number(r.tmax_f),
            Number(r.tmin_f)
          );

          return `
            <div style="font-size:12px; line-height:1.5; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #f0f0f0;">
              <div style="font-weight:700;">${r.month_name}</div>

              <div>Early: ${temps.earlyMax}° / ${temps.earlyMin}°</div>
              <div>Mid: ${temps.midMax}° / ${temps.midMin}°</div>
              <div>Late: ${temps.lateMax}° / ${temps.lateMin}°</div>
              <div>Precip: ${r.precip}"</div>

              <div style="margin-top:4px; font-weight:700; color:${mosq.color};">
                Mosquito Risk: ${mosq.label}
              </div>

              <div style="margin-top:6px; padding-top:6px; border-top:1px solid #f6f6f6;">
                <div>
                  Day:
                  <span style="font-weight:700; color:${getTravelColor(r.day_label)};">
                    ${r.day_label}
                  </span>
                </div>
                <div>
                  Night:
                  <span style="font-weight:700; color:${getTravelColor(r.night_label)};">
                    ${r.night_label}
                  </span>
                </div>
                <div>
                  Precip:
                  <span style="font-weight:700; color:${getTravelColor(r.precip_label)};">
                    ${r.precip_label}
                  </span>
                </div>
                <div>
                  Mosquito:
                  <span style="font-weight:700; color:${getTravelColor(r.mosquito_label)};">
                    ${mosquitoDisplay}
                  </span>
                </div>
                <div style="margin-top:4px; font-size:13px;">
                  <span style="font-weight:700;">Travel Score:</span>
                  <span style="font-weight:700; color:#1565c0;"> ${formatTravelScore(Number(r.travel_score))} / 10</span>
                </div>
                <div style="margin-top:2px; font-size:12px;">
                  Band: <b>${r.score_band}</b>
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

    if (!allSelectedRegions.length || !activeLayerMonth || !mapRef.current) return;

    const google = (window as any).google;
    if (!google) return;

    const responses = await Promise.all(
      allSelectedRegions.map((region) =>
        supabase.rpc("get_state_travel_score_layer_sql", {
          p_state: region,
          p_month: activeLayerMonth,
        })
      )
    );

    for (const response of responses) {
      if (response.error) {
        console.error("Travel layer error:", response.error);
        continue;
      }
      const rows = (response.data ?? []) as TravelLayerRow[];
      rows.forEach((row) => {
        addPolygonFeature(google, mapRef.current, row.geom_geojson, row);
      });
    }
  };

  useEffect(() => {
    loadTravelLayer();
  }, [selectedLayerStates, selectedLayerProvinces, activeLayerMonth]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) return;

    const existingScript = document.querySelector(`script[data-gmaps="climate-sql-page"]`);
    if (existingScript) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.dataset.gmaps = "climate-sql-page";
    script.onload = initMap;
    document.head.appendChild(script);

    function initMap() {
      const google = (window as any).google;
      if (!google || mapRef.current) return;

      const map = new google.maps.Map(
        document.getElementById("climate-sql-map") as HTMLElement,
        {
          center: { lat: 44.5, lng: -101.0 },
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
    <div style={{ height: "100vh", width: "100%", position: "relative", fontFamily: "sans-serif" }}>
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
          padding: "8px 12px",
          textDecoration: "none",
          color: "#333",
          fontWeight: 700,
          fontSize: 12,
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
            width: 340,
            maxWidth: "calc(100vw - 24px)",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 12,
            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              <div style={{ fontWeight: 700, fontSize: 16, color: "#222" }}>
                Climate
              </div>
            </div>

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
                flexShrink: 0,
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.4 }}>
            Select month(s), then tap the map. For state/province shading, choose one or more U.S. states and/or Canada provinces below.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 5,
              marginBottom: 10,
            }}
          >
            {MONTHS.map((m) => {
              const selected = selectedMonths.includes(m.num);
              const isActiveLayerMonth =
                activeLayerMonth === m.num &&
                allSelectedRegions.length > 0 &&
                selected;

              return (
                <button
                  key={m.num}
                  onClick={() => toggleMonth(m.num)}
                  style={{
                    border: isActiveLayerMonth ? "2px solid #333" : "1px solid #ccc",
                    borderRadius: 6,
                    padding: "6px 0",
                    fontSize: 11,
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

          {loading && <div style={{ fontSize: 12, marginBottom: 8 }}>Loading...</div>}
          {errorMsg && <div style={{ fontSize: 12, color: "#c62828", marginBottom: 8 }}>{errorMsg}</div>}

          {clickedLatLng && (
            <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
              Clicked: {clickedLatLng.lat.toFixed(3)}, {clickedLatLng.lng.toFixed(3)}
            </div>
          )}

          <div style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 4, marginBottom: 10 }}>
            <button
              onClick={() => setTravelSectionOpen((v) => !v)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                margin: 0,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "#333",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13 }}>Travel Map</span>
              <span style={{ fontSize: 14 }}>{travelSectionOpen ? "▲" : "▼"}</span>
            </button>

            {travelSectionOpen && (
              <div style={{ marginTop: 10 }}>
                <div style={{ border: "1px solid #e8e8e8", borderRadius: 6, marginBottom: 8, overflow: "hidden" }}>
                  <button
                    onClick={() => setStatesSectionOpen((v) => !v)}
                    style={{
                      width: "100%",
                      background: "#fafafa",
                      border: "none",
                      borderBottom: statesSectionOpen ? "1px solid #e8e8e8" : "none",
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#333",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#555", fontWeight: 700 }}>
                      U.S. States
                    </span>
                    <span style={{ fontSize: 12 }}>{statesSectionOpen ? "▲" : "▼"}</span>
                  </button>

                  {statesSectionOpen && (
                    <div style={{ padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: "#555" }}>States</div>
                        {selectedLayerStates.length > 0 && (
                          <button
                            onClick={() => setSelectedLayerStates([])}
                            style={{
                              border: "none",
                              background: "none",
                              color: "#1565c0",
                              fontSize: 11,
                              cursor: "pointer",
                              padding: 0,
                              fontWeight: 700,
                            }}
                          >
                            Clear states
                          </button>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 4,
                          maxHeight: "120px",
                          overflowY: "auto",
                          border: "1px solid #e5e5e5",
                          borderRadius: 6,
                          padding: 6,
                          background: "#fafafa",
                        }}
                      >
                        {US_STATES.map((st) => (
                          <label
                            key={st}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedLayerStates.includes(st)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLayerStates((prev) =>
                                    prev.includes(st) ? prev : [...prev, st]
                                  );
                                } else {
                                  setSelectedLayerStates((prev) => prev.filter((s) => s !== st));
                                }
                              }}
                            />
                            <span>{st}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ border: "1px solid #e8e8e8", borderRadius: 6, marginBottom: 10, overflow: "hidden" }}>
                  <button
                    onClick={() => setProvincesSectionOpen((v) => !v)}
                    style={{
                      width: "100%",
                      background: "#fafafa",
                      border: "none",
                      borderBottom: provincesSectionOpen ? "1px solid #e8e8e8" : "none",
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#333",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#555", fontWeight: 700 }}>
                      Canada Provinces / Territories
                    </span>
                    <span style={{ fontSize: 12 }}>{provincesSectionOpen ? "▲" : "▼"}</span>
                  </button>

                  {provincesSectionOpen && (
                    <div style={{ padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: "#555" }}>Provinces</div>
                        {selectedLayerProvinces.length > 0 && (
                          <button
                            onClick={() => setSelectedLayerProvinces([])}
                            style={{
                              border: "none",
                              background: "none",
                              color: "#1565c0",
                              fontSize: 11,
                              cursor: "pointer",
                              padding: 0,
                              fontWeight: 700,
                            }}
                          >
                            Clear provinces
                          </button>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 4,
                          maxHeight: "120px",
                          overflowY: "auto",
                          border: "1px solid #e5e5e5",
                          borderRadius: 6,
                          padding: 6,
                          background: "#fafafa",
                        }}
                      >
                        {CANADA_PROVINCES.map((prov) => (
                          <label
                            key={prov}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedLayerProvinces.includes(prov)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLayerProvinces((prev) =>
                                    prev.includes(prov) ? prev : [...prev, prov]
                                  );
                                } else {
                                  setSelectedLayerProvinces((prev) =>
                                    prev.filter((p) => p !== prov)
                                  );
                                }
                              }}
                            />
                            <span>{prov}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
                  Map month
                </div>

                {!selectedLayerMonthOptions.length ? (
                  <div style={{ fontSize: 11, color: "#777", marginBottom: 8 }}>
                    Select one or more months above.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    {selectedLayerMonthOptions.map((m) => {
                      const active = activeLayerMonth === m.num;
                      return (
                        <button
                          key={m.num}
                          onClick={() => setActiveLayerMonth(m.num)}
                          style={{
                            border: active ? "2px solid #333" : "1px solid #ccc",
                            borderRadius: 14,
                            padding: "5px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                            background: active ? "#1a73e8" : "white",
                            color: active ? "white" : "#333",
                            fontWeight: active ? 700 : 400,
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>
                  Shading appears automatically when one or more states or provinces and an active selected month are chosen.
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#666", lineHeight: 1.4 }}>
                  Map colors: 8–10 dark green, 6–8 light green, 4–6 yellow, 2–4 orange, 0–2 red.
                </div>

                {allSelectedRegions.length > 0 && activeLayerMonth && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#444", fontWeight: 700 }}>
                    Showing {allSelectedRegions.join(", ")} • {MONTH_LABEL_BY_NUM[activeLayerMonth]}
                  </div>
                )}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {results[0].state_abbr} — {results[0].division_name}
              </div>

              <div style={{ display: "grid", gap: 8, maxHeight: "32vh", overflowY: "auto", paddingRight: 4 }}>
                {results.map((r) => {
                  const mosq = getMosquitoCategory(Number(r.mosquito_score));
                  const mosquitoDisplay = r.mosquito_label_display || r.mosquito_label;
                  const temps = getMonthPhaseTemps(
                    Number(r.month),
                    Number(r.tmax_f),
                    Number(r.tmin_f)
                  );

                  return (
                    <div
                      key={`${r.month}-${r.month_name}`}
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
                        Early&nbsp;&nbsp; High {temps.earlyMax}° &nbsp;&nbsp; Low {temps.earlyMin}°
                      </div>
                      <div>
                        Mid&nbsp;&nbsp;&nbsp;&nbsp; High {temps.midMax}° &nbsp;&nbsp; Low {temps.midMin}°
                      </div>
                      <div>
                        Late&nbsp;&nbsp;&nbsp; High {temps.lateMax}° &nbsp;&nbsp; Low {temps.lateMin}°
                      </div>

                      <div>
                        Precip {r.precip}"
                      </div>

                      <div style={{ marginTop: 4, fontWeight: 700, color: mosq.color }}>
                        Mosquito Risk: {mosq.label}
                      </div>

                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #f7f7f7" }}>
                        <div>
                          Day:{" "}
                          <span style={{ fontWeight: 700, color: getTravelColor(r.day_label) }}>
                            {r.day_label}
                          </span>
                        </div>
                        <div>
                          Night:{" "}
                          <span style={{ fontWeight: 700, color: getTravelColor(r.night_label) }}>
                            {r.night_label}
                          </span>
                        </div>
                        <div>
                          Precip:{" "}
                          <span style={{ fontWeight: 700, color: getTravelColor(r.precip_label) }}>
                            {r.precip_label}
                          </span>
                        </div>
                        <div>
                          Mosquito:{" "}
                          <span style={{ fontWeight: 700, color: getTravelColor(r.mosquito_label) }}>
                            {mosquitoDisplay}
                          </span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontWeight: 700 }}>Travel Score:</span>{" "}
                          <span style={{ fontWeight: 700, color: "#1565c0" }}>
                            {formatTravelScore(Number(r.travel_score))} / 10
                          </span>
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <span style={{ fontWeight: 700 }}>Band:</span> {r.score_band}
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
            Mosquito risk is a climate-based monthly estimate, not a real-time forecast based on local conditions and habitats. Average temperatures do not reflect elevation differences in western states. Travel score ratings are experimental.
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
        >
          Climate
        </button>
      )}

      <div id="climate-sql-map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}