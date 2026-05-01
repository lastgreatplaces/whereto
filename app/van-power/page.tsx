"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function VanPowerPage() {
  const router = useRouter();

  const [rows, setRows] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});

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
  // INPUT HELPERS
  // =========================

  function getVal(key: string, fallback: any) {
    return edit[key] ?? (fallback ?? "").toString();
  }

  function setVal(key: string, value: string) {
    setEdit((prev) => ({ ...prev, [key]: value }));
  }

  async function save(date: string, field: string, value: string) {
    const parsed = value === "" ? null : parseFloat(value);

    await supabase
      .from("power_trip_days")
      .update({ [field]: parsed })
      .eq("trip_date", date);

    loadData();
  }

  async function updateField(date: string, field: string, value: any) {
    await supabase
      .from("power_trip_days")
      .update({ [field]: value })
      .eq("trip_date", date);

    loadData();
  }

  // =========================
  // DEVICE UPDATE
  // =========================

  async function updateDevice(id: number, field: string, value: any) {
    await supabase
      .from("power_profile_devices")
      .update({ [field]: value })
      .eq("id", id);

    loadDevices();
    loadData();
  }

  // =========================
  // RENDER
  // =========================

  return (
    <div style={{ padding: 10, fontFamily: "sans-serif" }}>
      <button onClick={() => router.push("/")}>← Home</button>

      <h2>Van Power — {tripName}</h2>

      {/* =========================
          FORECAST TABLE
      ========================= */}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            minWidth: 720,
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontSize: 13
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #ccc" }}>
              <th style={{ width: 90, textAlign: "left" }}>Date</th>

              <th style={{ width: 45, textAlign: "right" }}>7A</th>
              <th style={{ width: 45, textAlign: "right" }}>7P</th>

              <th style={{ width: 55, textAlign: "right", color: "#1565c0" }}>
                For
              </th>

              <th style={{ width: 60, textAlign: "right" }}>Pln</th>
              <th style={{ width: 60, textAlign: "right" }}>Act</th>

              <th style={{ width: 70 }}>Wx</th>
              <th style={{ width: 40, textAlign: "center" }}>Sh</th>
              <th style={{ width: 50, textAlign: "center" }}>H2O</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.trip_date} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ whiteSpace: "normal" }}>{r.date_label}</td>

                <td style={{ textAlign: "right" }}>
                  {r.battery_pct_7am ?? ""}
                </td>

                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {r.actual_7pm_pct ?? ""}
                </td>

                <td
                  style={{
                    textAlign: "right",
                    color: "#1565c0",
                    fontWeight: 700
                  }}
                >
                  {r.forecast_7pm_pct ?? ""}
                </td>

                {/* PLAN */}
                <td style={{ textAlign: "right" }}>
                  <input
                    style={{ width: 50, textAlign: "right" }}
                    inputMode="decimal"
                    value={getVal(`${r.trip_date}-plan`, r.plan_drive)}
                    onChange={(e) =>
                      setVal(`${r.trip_date}-plan`, e.target.value)
                    }
                    onBlur={(e) =>
                      save(r.trip_date, "driving_hours", e.target.value)
                    }
                  />
                </td>

                {/* ACTUAL */}
                <td style={{ textAlign: "right" }}>
                  <input
                    style={{ width: 50, textAlign: "right", fontWeight: 600 }}
                    inputMode="decimal"
                    value={getVal(`${r.trip_date}-act`, r.actual_drive)}
                    onChange={(e) =>
                      setVal(`${r.trip_date}-act`, e.target.value)
                    }
                    onBlur={(e) =>
                      save(r.trip_date, "actual_driving_hours", e.target.value)
                    }
                  />
                </td>

                {/* WEATHER */}
                <td>
                  <select
                    value={r.plan_condition ?? ""}
                    onChange={(e) =>
                      updateField(r.trip_date, "condition_text", e.target.value)
                    }
                  >
                    <option value="Sunny">Sunny</option>
                    <option value="Partly Sunny">Partly Sunny</option>
                    <option value="Cloudy">Cloudy</option>
                  </select>
                </td>

                {/* SHORE */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.plan_shore ?? false}
                    onChange={(e) =>
                      updateField(
                        r.trip_date,
                        "night_shore_power",
                        e.target.checked
                      )
                    }
                  />
                </td>

                {/* H2O */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.plan_h2o ?? false}
                    onChange={(e) =>
                      updateField(
                        r.trip_date,
                        "day_hot_water",
                        e.target.checked
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* =========================
          POWER DEVICES
      ========================= */}

      <h3 style={{ marginTop: 30 }}>Power Devices</h3>

      <table style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th>Device</th>
            <th>W</th>
            <th>Min</th>
            <th>Use</th>
            <th>On</th>
            <th>Wh</th>
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
                <td>{d.device_name}</td>

                <td>
                  <input
                    style={{ width: 50 }}
                    defaultValue={d.avg_watts}
                    onBlur={(e) =>
                      updateDevice(d.id, "avg_watts", Number(e.target.value))
                    }
                  />
                </td>

                <td>
                  <input
                    style={{ width: 50 }}
                    defaultValue={d.mins_per_use}
                    onBlur={(e) =>
                      updateDevice(d.id, "mins_per_use", Number(e.target.value))
                    }
                  />
                </td>

                <td>
                  <input
                    style={{ width: 50 }}
                    defaultValue={d.uses_per_day}
                    onBlur={(e) =>
                      updateDevice(
                        d.id,
                        "uses_per_day",
                        parseFloat(e.target.value)
                      )
                    }
                  />
                </td>

                <td>
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) =>
                      updateDevice(d.id, "enabled", e.target.checked)
                    }
                  />
                </td>

                <td style={{ fontWeight: 600 }}>{Math.round(wh)}</td>
              </tr>
            );
          })}

          <tr style={{ fontWeight: 700 }}>
            <td colSpan={5} style={{ textAlign: "right" }}>
              Total
            </td>
            <td>
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
  );
}