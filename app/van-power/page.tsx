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
    .from("v_power_trip_forecast_7pm")
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
<table style={{ minWidth: 950, borderCollapse: "collapse", fontSize: 13 }}>
<thead>
<tr>
<th>Date</th>
<th>7A</th>
<th>7P</th>
<th style={{ color:"#1565c0" }}>For</th>
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
{rows.map((r:any)=>(
<tr key={r.trip_date}>

<td>{r.date_label}</td>

<td>{r.battery_pct_7am ?? ""}</td>

<td>{r.actual_7pm_pct ?? ""}</td>

<td style={{
  color:
    r.forecast_7pm_pct < 20 ? "red" :
    r.forecast_7pm_pct < 40 ? "orange" :
    "#1565c0",
  fontWeight:700
}}>
{r.forecast_7pm_pct}
</td>

<td>
<input
  style={{ width:50 }}
  inputMode="decimal"
  defaultValue={r.plan_drive ?? ""}
  onBlur={(e)=>updateField(r.trip_date,"driving_hours",e.target.value)}
/>
</td>

<td>
<select
value={r.plan_condition ?? ""}
onChange={(e)=>updateField(r.trip_date,"condition_text",e.target.value)}
>
<option>Sunny</option>
<option>Partly Sunny</option>
<option>Cloudy</option>
</select>
</td>

<td>
<input
type="checkbox"
checked={r.plan_shore ?? false}
onChange={(e)=>updateField(r.trip_date,"night_shore_power",e.target.checked)}
/>
</td>

<td>
<input
type="checkbox"
checked={r.plan_h2o ?? false}
onChange={(e)=>updateField(r.trip_date,"day_hot_water",e.target.checked)}
/>
</td>

<td>{r.solar_wh}</td>
<td>{r.driving_wh}</td>
<td>{r.shore_wh}</td>
<td style={{ fontWeight:700 }}>{r.total_wh}</td>

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