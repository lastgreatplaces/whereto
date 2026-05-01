"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

export default function VanPowerPage() {
  const router = useRouter();

  const [rows, setRows] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [deviceInputs, setDeviceInputs] = useState<Record<string, any>>({});

  const tripName = "Spring Migration 2026";

  // =========================
  // LOAD DATA
  // =========================

  async function loadData() {
    const { data } = await supabase
      .from("v_power_trip_window")
      .select("*")
      .eq("trip_name", tripName)
      .order("trip_date");

    setRows(data || []);
  }

  async function loadDevices() {
    const { data } = await supabase
      .from("v_power_devices")
      .select("*");

    setDevices(data || []);
  }

  useEffect(() => {
    loadData();
    loadDevices();
  }, []);

  // =========================
  // DEVICE INPUT HANDLING
  // =========================

  function getDeviceValue(id: number, field: string, fallback: any) {
    const key = `${id}-${field}`;
    return deviceInputs[key] ?? fallback ?? "";
  }

  function setDeviceValue(id: number, field: string, value: any) {
    const key = `${id}-${field}`;
    setDeviceInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function updateDevice(id: number, field: string, value: any) {
    await supabase
      .from("power_profile_devices")
      .update({ [field]: value })
      .eq("id", id);

    await loadDevices();
    await loadData();
  }

  // =========================
  // STYLES (MOBILE-FOCUSED)
  // =========================

  const th = {
    padding: "4px 6px",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap" as const
  };

  const td = {
    padding: "4px 6px",
    fontSize: 13,
    whiteSpace: "nowrap" as const
  };

  const num = {
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums"
  };

  const inputNum = {
    width: 48,
    textAlign: "right" as const,
    fontSize: 13
  };

  const dateCol = {
    width: 72,
    whiteSpace: "normal" as const
  };

  // =========================
  // RENDER
  // =========================

  return (
    <div style={{ padding: 10, fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => router.push("/")}>← Home</button>
      </div>

      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>
        Van Power — {tripName}
      </div>

      {/* =========================
          MAIN TABLE
      ========================= */}

     
<div style={{ overflowX: "auto" }}>
  <table
    style={{
      width: "100%",
      borderCollapse: "collapse",
      tableLayout: "fixed",
      fontSize: 13
    }}
  >
    <thead>
      <tr style={{ borderBottom: "1px solid #ccc" }}>
        <th style={{ width: 70, textAlign: "left" }}>Date</th>

        <th style={{ width: 36, textAlign: "right" }}>7A</th>
        <th style={{ width: 36, textAlign: "right" }}>7P</th>

        <th style={{ width: 42, textAlign: "right", color: "#1565c0" }}>For</th>
        <th style={{ width: 28, textAlign: "right" }}>Δ</th>

        <th style={{ width: 40, textAlign: "right" }}>Pln</th>
        <th style={{ width: 40, textAlign: "right" }}>Act</th>

        <th style={{ width: 54, textAlign: "left" }}>Wx</th>

        <th style={{ width: 32, textAlign: "center" }}>Sh</th>
        <th style={{ width: 36, textAlign: "center" }}>H2O</th>
      </tr>
    </thead>

    <tbody>
      {rows.map((r) => (
        <tr key={r.trip_date} style={{ borderBottom: "1px solid #eee" }}>
          
          {/* DATE */}
          <td style={{ whiteSpace: "normal" }}>
            {r.date_label}
          </td>

          {/* 7AM */}
          <td style={{ textAlign: "right" }}>
            {r.battery_pct_7am ?? ""}
          </td>

          {/* 7PM */}
          <td style={{ textAlign: "right", fontWeight: 600 }}>
            {r.actual_7pm_pct ?? ""}
          </td>

          {/* FORECAST */}
          <td style={{ textAlign: "right", color: "#1565c0", fontWeight: 700 }}>
            {r.forecast_7pm_pct ?? ""}
          </td>

          {/* DELTA */}
          <td style={{ textAlign: "right" }}>
            {r.pct_diff ?? ""}
          </td>

          {/* PLAN DRIVE */}
          <td style={{ textAlign: "right" }}>
            {r.plan_drive ?? ""}
          </td>

          {/* ACTUAL DRIVE */}
          <td style={{ textAlign: "right", fontWeight: 600 }}>
            {r.actual_drive ?? ""}
          </td>

          {/* WEATHER (Plan only for mobile simplicity) */}
          <td>
            {r.plan_condition}
          </td>

          {/* SHORE */}
          <td style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              checked={r.plan_shore ?? false}
              readOnly
            />
          </td>

          {/* H2O */}
          <td style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              checked={r.plan_h2o ?? false}
              readOnly
            />
          </td>

        </tr>
      ))}
    </tbody>
  </table>
</div>

      {/* =========================
          DEVICES TABLE
      ========================= */}

      <div style={{ marginTop: 30 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Power Devices
        </div>

        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Device</th>
              <th style={{ ...th, ...num }}>W</th>
              <th style={{ ...th, ...num }}>Min</th>
              <th style={{ ...th, ...num }}>Use</th>
              <th style={{ ...th, textAlign: "center" }}>On</th>
              <th style={{ ...th, ...num }}>Wh</th>
            </tr>
          </thead>

          <tbody>
            {devices.map((d) => {
              const wh =
                d.enabled
                  ? (d.avg_watts * d.mins_per_use * d.uses_per_day) / 60
                  : 0;

              return (
                <tr key={d.id}>
                  <td style={td}>{d.device_name}</td>

                  <td style={{ ...td, ...num }}>
                    <input
                      style={inputNum}
                      value={getDeviceValue(d.id, "avg_watts", d.avg_watts)}
                      onChange={(e) =>
                        setDeviceValue(d.id, "avg_watts", e.target.value)
                      }
                      onBlur={(e) =>
                        updateDevice(d.id, "avg_watts", Number(e.target.value))
                      }
                    />
                  </td>

                  <td style={{ ...td, ...num }}>
                    <input
                      style={inputNum}
                      value={getDeviceValue(d.id, "mins_per_use", d.mins_per_use)}
                      onChange={(e) =>
                        setDeviceValue(d.id, "mins_per_use", e.target.value)
                      }
                      onBlur={(e) =>
                        updateDevice(d.id, "mins_per_use", Number(e.target.value))
                      }
                    />
                  </td>

                  <td style={{ ...td, ...num }}>
                    <input
                      style={inputNum}
                      value={getDeviceValue(d.id, "uses_per_day", d.uses_per_day)}
                      onChange={(e) =>
                        setDeviceValue(d.id, "uses_per_day", e.target.value)
                      }
                      onBlur={(e) =>
                        updateDevice(d.id, "uses_per_day", parseFloat(e.target.value))
                      }
                    />
                  </td>

                  <td style={{ ...td, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) =>
                        updateDevice(d.id, "enabled", e.target.checked)
                      }
                    />
                  </td>

                  <td style={{ ...td, ...num, fontWeight: 600 }}>
                    {Math.round(wh)}
                  </td>
                </tr>
              );
            })}

            {/* TOTAL */}
            <tr style={{ borderTop: "2px solid #ccc", fontWeight: 700 }}>
              <td colSpan={5} style={{ textAlign: "right", paddingRight: 6 }}>
                Total
              </td>
              <td style={{ ...num }}>
                {Math.round(
                  devices.reduce((sum, d) => {
                    if (!d.enabled) return sum;
                    return (
                      sum +
                      (d.avg_watts * d.mins_per_use * d.uses_per_day) / 60
                    );
                  }, 0)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}