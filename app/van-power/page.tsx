"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function VanPowerPage() {
  const tripName = "Spring Migration 2026";

  const [rows, setRows] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({});

  // =========================
  // LOAD DATA
  // =========================
  async function loadData() {
    const { data } = await supabase
      .from("v_power_trip_forecast_7pm")
      .select("*")
      .eq("trip_name", tripName)
      .order("trip_date");

    if (data) setRows(data);
  }

  async function loadDevices() {
    const { data } = await supabase
      .from("power_profile_devices")
      .select("*")
      .order("id");

    if (data) setDevices(data);
  }

  async function loadProfile() {
    const { data } = await supabase
      .from("power_profiles")
      .select("*")
      .eq("id", 1)
      .single();

    if (data) setProfile(data);
  }

  useEffect(() => {
    loadData();
    loadDevices();
    loadProfile();
  }, []);

  // =========================
  // UPDATE HELPERS
  // =========================
  async function updateField(date: string, field: string, value: any) {
    await supabase
      .from("power_trip_days")
      .update({ [field]: value })
      .eq("trip_date", date);

    loadData();
  }

  async function updateProfile(field: string, value: any) {
    await supabase
      .from("power_profiles")
      .update({ [field]: value })
      .eq("id", 1);

    await loadProfile();
    await loadData();
  }

  // =========================
  // RENDER
  // =========================
  return (
    <div style={{ padding: 12, fontSize: 14 }}>
      <Link href="/">← Home</Link>

      <h2 style={{ marginTop: 10 }}>
        Van Power — Spring Migration 2026
      </h2>

      {/* =========================
          FORECAST TABLE
      ========================= */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 950, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>7A</th>
              <th>7P</th>
              <th style={{ color: "#1565c0" }}>For</th>
              <th>Pln</th>
              <th>Wx</th>
              <th>Sh</th>
              <th>H2O</th>
              <th>Sol</th>
              <th>Drv</th>
              <th>Shr</th>
              <th>Tot</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.trip_date}>
                <td>{r.date_label}</td>

                {/* 7AM */}
                <td>
                  <input
                    style={{ width: 55, textAlign: "right" }}
                    inputMode="numeric"
                    defaultValue={r.battery_pct_7am ?? ""}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) =>
                      updateField(
                        r.trip_date,
                        "battery_pct_7am",
                        e.target.value === ""
                          ? null
                          : parseInt(e.target.value)
                      )
                    }
                  />
                </td>

                {/* 7PM */}
                <td>
                  <input
                    style={{ width: 55, textAlign: "right" }}
                    inputMode="numeric"
                    defaultValue={r.actual_7pm_pct ?? ""}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) =>
                      updateField(
                        r.trip_date,
                        "battery_pct_7pm",
                        e.target.value === ""
                          ? null
                          : parseInt(e.target.value)
                      )
                    }
                  />
                </td>

                {/* FORECAST */}
                <td
                  style={{
                    fontWeight: 700,
                    color:
                      r.forecast_7pm_pct < 20
                        ? "red"
                        : r.forecast_7pm_pct < 40
                        ? "orange"
                        : "#1565c0",
                  }}
                >
                  {r.forecast_7pm_pct}
                </td>

                {/* PLAN DRIVE */}
                <td>
                  <input
                    style={{ width: 55, textAlign: "right" }}
                    inputMode="decimal"
                    defaultValue={
                      r.plan_drive != null
                        ? Number(r.plan_drive).toFixed(1)
                        : ""
                    }
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const val = e.target.value;
                      updateField(
                        r.trip_date,
                        "driving_hours",
                        val === "" ? null : parseFloat(val)
                      );
                      if (val !== "") {
                        e.target.value = parseFloat(val).toFixed(1);
                      }
                    }}
                  />
                </td>

                {/* WEATHER */}
                <td>
                  <select
                    value={r.plan_condition || ""}
                    onChange={(e) =>
                      updateField(
                        r.trip_date,
                        "condition_text",
                        e.target.value
                      )
                    }
                  >
                    <option>Sunny</option>
                    <option>Partly Sunny</option>
                    <option>Cloudy</option>
                  </select>
                </td>

                {/* SHORE */}
                <td>
                  <input
                    type="checkbox"
                    checked={r.plan_shore || false}
                    onChange={(e) =>
                      updateField(
                        r.trip_date,
                        "night_shore_power",
                        e.target.checked
                      )
                    }
                  />
                </td>

                {/* HOT WATER */}
                <td>
                  <input
                    type="checkbox"
                    checked={r.plan_h2o || false}
                    onChange={(e) =>
                      updateField(
                        r.trip_date,
                        "day_hot_water",
                        e.target.checked
                      )
                    }
                  />
                </td>

                {/* ENERGY */}
                <td>{r.solar_wh}</td>
                <td>{r.driving_wh}</td>
                <td>{r.shore_wh}</td>
                <td style={{ fontWeight: 700 }}>{r.total_wh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* =========================
          POWER DEVICES
      ========================= */}
      <h3 style={{ marginTop: 20 }}>Power Devices</h3>

      <table style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Device</th>
            <th>W</th>
            <th>Min</th>
            <th>Use</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>{d.device_name}</td>
              <td>{d.avg_watts}</td>
              <td>{d.mins_per_use}</td>
              <td>{d.uses_per_day}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* =========================
          VAN PROFILE
      ========================= */}
      <h3 style={{ marginTop: 20 }}>Van Power Profile</h3>

      <table style={{ maxWidth: 400 }}>
        <tbody>
          <tr>
            <td>Season</td>
            <td>
              <select
                value={profile.season || ""}
                onChange={(e) =>
                  updateProfile("season", e.target.value)
                }
              >
                <option>Spring/Fall</option>
                <option>Summer</option>
                <option>Winter</option>
              </select>
            </td>
          </tr>

          <tr>
            <td>Latitude</td>
            <td>
              <select
                value={profile.latitude_band || ""}
                onChange={(e) =>
                  updateProfile("latitude_band", e.target.value)
                }
              >
                <option>South</option>
                <option>Central</option>
                <option>North</option>
              </select>
            </td>
          </tr>

          <tr>
            <td>Solar Watts</td>
            <td>
              <input
                style={{ width: 80, textAlign: "right" }}
                defaultValue={profile.solar_watts ?? ""}
                onFocus={(e) => e.target.select()}
                onBlur={(e) =>
                  updateProfile(
                    "solar_watts",
                    Number(e.target.value)
                  )
                }
              />
            </td>
          </tr>

          <tr>
            <td>Shore Amps</td>
            <td>
              <input
                style={{ width: 80, textAlign: "right" }}
                defaultValue={profile.shore_charge_amps ?? ""}
                onFocus={(e) => e.target.select()}
                onBlur={(e) =>
                  updateProfile(
                    "shore_charge_amps",
                    Number(e.target.value)
                  )
                }
              />
            </td>
          </tr>

          <tr>
            <td>Shore Hours</td>
            <td>
              <input
                style={{ width: 80, textAlign: "right" }}
                defaultValue={profile.shore_power_hours ?? 6}
                onFocus={(e) => e.target.select()}
                onBlur={(e) =>
                  updateProfile(
                    "shore_power_hours",
                    Number(e.target.value)
                  )
                }
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}