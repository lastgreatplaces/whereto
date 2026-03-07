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
  division_name: string;
  month_name: string;
  tmax_f: number;
  tmin_f: number;
  mosquito_score: number;
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

function getMosquitoCategory(score: number) {
  if (score <= 2.4) return { label: "Very Low", color: "#2e7d32" };
  if (score <= 4.4) return { label: "Low", color: "#558b2f" };
  if (score <= 6.4) return { label: "Moderate", color: "#f9a825" };
  if (score <= 8.4) return { label: "High", color: "#ef6c00" };
  return { label: "Very High", color: "#c62828" };
}

export default function ClimatePage() {
  const [selectedMonths, setSelectedMonths] = useState<number[]>([3, 4, 5]);
  const [results, setResults] = useState<ClimateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [clickedLatLng, setClickedLatLng] = useState<{ lat: number; lng: number } | null>(null);

  const selectedMonthsRef = useRef<number[]>([3, 4, 5]);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);

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

      const header = `<div style="font-weight:700; margin-bottom:8px;">${rows[0].state_abbr} — ${rows[0].division_name}</div>`;

      const body = rows
        .map((r) => {
          const mosq = getMosquitoCategory(Number(r.mosquito_score));
          return `
            <div style="font-size:12px; line-height:1.5; margin-bottom:10px;">
              <div style="font-weight:700;">${r.month_name}</div>
              <div>Early: ${r.tmax_f - 6}° / ${r.tmin_f - 6}°</div>
              <div>Mid: ${r.tmax_f}° / ${r.tmin_f}°</div>
              <div>Late: ${r.tmax_f + 6}° / ${r.tmin_f + 6}°</div>
              <div style="margin-top:4px; font-weight:700; color:${mosq.color};">
                Mosquito Pressure: ${mosq.label}
              </div>
            </div>
          `;
        })
        .join("");

      infoWindowRef.current.setContent(`
        <div style="padding:10px; font-family:sans-serif; min-width:210px;">
          ${header}
          ${body}
        </div>
      `);
      infoWindowRef.current.setPosition({ lat, lng });
      infoWindowRef.current.open(mapRef.current);
    }
  };

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
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          zIndex: 10,
          width: 320,
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
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>Climate Map</div>
          <a
            href="/"
            style={{
              fontSize: 12,
              textDecoration: "none",
              background: "#f1f3f5",
              color: "#333",
              padding: "6px 8px",
              borderRadius: 6,
            }}
          >
            Back
          </a>
        </div>

        <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
          Select month(s), then click the map.
        </div>

        <div
          style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}
        >
          <button
            onClick={() => setSelectedMonths([])}
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
                  padding: "6px 0",
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
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {results[0].state_abbr} — {results[0].division_name}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {results.map((r) => {
                const mosq = getMosquitoCategory(Number(r.mosquito_score));
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
                      Mosquito Pressure: {mosq.label}
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
          }}
        >
          Mosquito pressure is a climate-based monthly suitability estimate, not
          a real-time forecast.
        </div>
      </div>

      <div id="climate-map" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}