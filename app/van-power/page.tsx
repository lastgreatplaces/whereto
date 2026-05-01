"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type Row = {
  trip_date: string;
  date_label: string;

  battery_pct_7am: number | null;
  actual_7pm_pct: number | null;
  forecast_7pm_pct: number | null;
  pct_diff: number | null;

  plan_drive: number | null;
  actual_drive: number | null;

  plan_condition: string | null;
  actual_condition: string | null;

  plan_shore: boolean | null;
  plan_h2o: boolean | null;
};

export default function VanPowerPage() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [devices, setDevices] = useState<any[]>([]);
  const [deviceInputs, setDeviceInputs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  const tripName = "Spring Migration 2026";

  // =========================
  // LOAD DATA
  // =========================

  async function loadData() {
    setLoading(true);

    const { data } = await supabase
      .from("v_power_trip_window")
      .select("*")
      .eq("trip_name", tripName)
      .order("trip_date");

    setRows(data || []);
    setLoading(false);
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
  // INPUT HELPERS (TRIP TABLE)
  // =========================

  function getValue(key: string, fallback: any) {
    return inputs[key] !== undefined ? inputs[key] : fallback ?? "";
  }

  function setLocalValue(key: string, value: any) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function commitValue(date: string, field: string, rawValue: string) {
    const value = rawValue === "" ? null : parseFloat(rawValue);

    await supabase
      .from("power_trip_days")
      .update({ [field]: value })
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
  // DEVICE HELPERS
  // =========================

  function getDeviceValue(id: number, field: string, fallback: any) {
    const key = `${id}-${field}`;
    return deviceInputs[key] !== undefined ? deviceInputs[key] : fallback ?? "";
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
  // RENDER
  // =========================

  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>

      {/* BACK BUTTON */}
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => router.push("/")}
          style={{ padding: "6px 10px", fontSize: 12 }}
        >
          ← Home
        </button>
      </div>

      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>
        Van Power — {tripName}
      </div>

      {loading && <div>Loading...</div>}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>7AM</th>
              <th>7PM</th>
              <th>Forecast</th>
              <th>Δ</th>
              <th>Plan</th>
              <th>Actual</th>
              <th>Plan Wx</th>
              <th>Actual Wx</th>
              <th>Shore</th>
              <th>H2O</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.trip_date}>
                <td>{r.date_label}</td>

                <td>
                  <input
                    value={getValue(`${r.trip_date}-7am`, r.battery_pct_7am)}
                    onChange={(e) =>
                      setLocalValue(`${r.trip_date}-7am`, e.target.value)
                    }
                    onBlur={(e) =>
                      commitValue(r.trip_date, "battery_pct_7am", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    value={getValue(`${r.trip_date}-7pm`, r.actual_7pm_pct)}
                    onChange={(e) =>
                      setLocalValue(`${r.trip_date}-7pm`, e.target.value)
                    }
                    onBlur={(e) =>
                      commitValue(r.trip_date, "battery_pct_7pm", e.target.value)
                    }
                  />
                </td>

                <td>{r.forecast_7pm_pct}</td>
                <td>{r.pct_diff}</td>

                <td>
                  <input
                    value={getValue(`${r.trip_date}-plan`, r.plan_drive)}
                    onChange={(e) =>
                      setLocalValue(`${r.trip_date}-plan`, e.target.value)
                    }
                    onBlur={(e) =>
                      commitValue(r.trip_date, "driving_hours", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    value={getValue(`${r.trip_date}-actual`, r.actual_drive)}
                    onChange={(e) =>
                      setLocalValue(`${r.trip_date}-actual`, e.target.value)
                    }
                    onBlur={(e) =>
                      commitValue(r.trip_date, "actual_driving_hours", e.target.value)
                    }
                  />
                </td>

                <td>
                  <select
                    value={r.plan_condition ?? ""}
                    onChange={(e) =>
                      updateField(r.trip_date, "condition_text", e.target.value)
                    }
                  >
                    <option>Sunny</option>
                    <option>Partly Sunny</option>
                    <option>Cloudy</option>
                  </select>
                </td>

                <td>
                  <select
                    value={r.actual_condition ?? ""}
                    onChange={(e) =>
                      updateField(r.trip_date, "actual_condition_text", e.target.value)
                    }
                  >
                    <option value=""></option>
                    <option>Sunny</option>
                    <option>Partly Sunny</option>
                    <option>Cloudy</option>
                  </select>
                </td>

                <td>
                  <input
                    type="checkbox"
                    checked={r.plan_shore ?? false}
                    onChange={(e) =>
                      updateField(r.trip_date, "night_shore_power", e.target.checked)
                    }
                  />
                </td>

                <td>
                  <input
                    type="checkbox"
                    checked={r.plan_h2o ?? false}
                    onChange={(e) =>
                      updateField(r.trip_date, "day_hot_water", e.target.checked)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* =========================
            DEVICES TABLE
        ========================= */}

        <div style={{ marginTop: 30 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            Power Devices
          </div>

          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th>Device</th>
                <th>Watts</th>
                <th>Minutes</th>
                <th>Uses/day</th>
                <th>On</th>
                <th>Wh/day</th>
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
                        value={getDeviceValue(d.id, "avg_watts", d.avg_watts)}
                        onChange={(e) =>
                          setDeviceValue(d.id, "avg_watts", e.target.value)
                        }
                        onBlur={(e) =>
                          updateDevice(d.id, "avg_watts", Number(e.target.value))
                        }
                      />
                    </td>

                    <td>
                      <input
                        value={getDeviceValue(d.id, "mins_per_use", d.mins_per_use)}
                        onChange={(e) =>
                          setDeviceValue(d.id, "mins_per_use", e.target.value)
                        }
                        onBlur={(e) =>
                          updateDevice(d.id, "mins_per_use", Number(e.target.value))
                        }
                      />
                    </td>

                    <td>
                      <input
                        value={getDeviceValue(d.id, "uses_per_day", d.uses_per_day)}
                        onChange={(e) =>
                          setDeviceValue(d.id, "uses_per_day", e.target.value)
                        }
                        onBlur={(e) =>
                          updateDevice(d.id, "uses_per_day", parseFloat(e.target.value))
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

                    <td style={{ fontWeight: 600 }}>
                      {Math.round(wh)}
                    </td>
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
      </div>
    </div>
  );
}