"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function VanPowerPage() {
  const tripName = "Spring Migration 2026";

  const [rows, setRows] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({});
  const [showAll, setShowAll] = useState(false);

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
  // UPDATE FUNCTIONS
  // =========================
  async function updateField(date: string, field: string, value: any) {
    await supabase
      .from("power_trip_days")
      .update({ [field]: value })
      .eq("trip_date", date);

    loadData();
  }

  async function updateDevice(id: number, field: string, value: any) {
    await supabase
      .from("power_profile_devices")
      .update({ [field]: value })
      .eq("id", id);

    loadDevices();
    loadData();
  }

  async function updateProfile(field: string, value: any) {
    await supabase
      .from("power_profiles")
      .update({ [field]: value })
      .eq("id", 1);

    loadProfile();
    loadData();
  }

  // =========================
  // FILTER (5 past / 5 future)
  // =========================
  const today = new Date();
today.setHours(0, 0, 0, 0);

const filteredRows = rows.filter((r) => {
  if (showAll) return true;

  const d = new Date(r.trip_date);
  d.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  return diffDays >= -5 && diffDays <= 5;
});

  return (
    <div style={{ padding: 12, fontSize: 14 }}>
      <Link href="/">← Home</Link>

      <h2 style={{ marginTop: 10 }}>
        Van Power — {tripName}
      </h2>

      {/* TOGGLE */}
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show 10-Day Window" : "Show Full History"}
        </button>
      </div>

      {/* =========================
          FORECAST TABLE
      ========================= */}
     <div style={{ overflowX: "auto" }}>
<table style={{ minWidth: 1150, borderCollapse: "collapse", fontSize: 13 }}>
<thead>
<tr>
<th style={{ width: 80 }}>Date</th>
<th style={{ width: 50 }}>7A</th>
<th style={{ width: 50 }}>7P</th>
<th style={{ width: 55, color:"#1565c0" }}>For</th>
<th style={{ width: 55 }}>Pln</th>
<th style={{ width: 110 }}>Wx</th>
<th style={{ width: 40 }}>Sh</th>
<th style={{ width: 45 }}>H2O</th>
<th style={{ width: 55 }}>Sol</th>
<th style={{ width: 55 }}>Drv</th>
<th style={{ width: 55 }}>Shr</th>
<th style={{ width: 60 }}>Tot</th>
<th style={{ width: 40 }}>Day</th>
<th style={{ minWidth: 220 }}>Notes</th>
</tr>
</thead>

<tbody>
{filteredRows.map((r)=>(
<tr key={r.trip_date}>

<td>{r.date_label}</td>

{/* 7AM */}
<td>
<input
style={{ width:45, textAlign:"right" }}
defaultValue={r.battery_pct_7am ?? ""}
onBlur={(e)=>updateField(
r.trip_date,
"battery_pct_7am",
e.target.value === "" ? null : parseInt(e.target.value)
)}
/>
</td>

{/* 7PM */}
<td>
<input
style={{ width:45, textAlign:"right" }}
defaultValue={r.actual_7pm_pct ?? ""}
onBlur={(e)=>updateField(
r.trip_date,
"battery_pct_7pm",
e.target.value === "" ? null : parseInt(e.target.value)
)}
/>
</td>

{/* Forecast */}
<td style={{
fontWeight:700,
textAlign:"right",
color:
r.forecast_7pm_pct < 20 ? "red" :
r.forecast_7pm_pct < 40 ? "orange" :
"#1565c0"
}}>
{r.forecast_7pm_pct}
</td>

{/* Plan */}
<td>
<input
style={{ width:50, textAlign:"right" }}
defaultValue={
r.plan_drive != null
? Number(r.plan_drive).toFixed(1)
: ""
}
onBlur={(e)=>updateField(
r.trip_date,
"driving_hours",
e.target.value === "" ? null : parseFloat(e.target.value)
)}
/>
</td>

{/* Weather */}
<td>
<select
value={r.plan_condition || ""}
onChange={(e)=>updateField(
r.trip_date,
"condition_text",
e.target.value
)}
>
<option>Sunny</option>
<option>Partly Sunny</option>
<option>Cloudy</option>
</select>
</td>

{/* Shore */}
<td style={{ textAlign:"center" }}>
<input
type="checkbox"
checked={r.plan_shore || false}
onChange={(e)=>updateField(
r.trip_date,
"night_shore_power",
e.target.checked
)}
/>
</td>

{/* H2O */}
<td style={{ textAlign:"center" }}>
<input
type="checkbox"
checked={r.plan_h2o || false}
onChange={(e)=>updateField(
r.trip_date,
"day_hot_water",
e.target.checked
)}
/>
</td>

<td style={{ textAlign:"right" }}>{r.solar_wh}</td>
<td style={{ textAlign:"right" }}>{r.driving_wh}</td>
<td style={{ textAlign:"right" }}>{r.shore_wh}</td>
<td style={{ textAlign:"right", fontWeight:700 }}>{r.total_wh}</td>

{/* Day (moved here) */}
<td style={{ textAlign:"center" }}>{r.trip_day}</td>

{/* Notes (wider) */}
<td>
<input
style={{ width:"100%", minWidth:220 }}
defaultValue={r.notes || ""}
onBlur={(e)=>updateField(
r.trip_date,
"notes",
e.target.value
)}
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
      <h3 style={{ marginTop: 20 }}>Power Devices</h3>

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
                    style={{ width: 60, textAlign: "right" }}
                    defaultValue={d.avg_watts}
                    onBlur={(e) =>
                      updateDevice(d.id, "avg_watts", Number(e.target.value))
                    }
                  />
                </td>

                <td>
                  <input
                    style={{ width: 60, textAlign: "right" }}
                    defaultValue={d.mins_per_use}
                    onBlur={(e) =>
                      updateDevice(d.id, "mins_per_use", Number(e.target.value))
                    }
                  />
                </td>

                <td>
                  <input
                    style={{ width: 60, textAlign: "right" }}
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

      {/* =========================
          VAN PROFILE
      ========================= */}
      <h3 style={{ marginTop: 20 }}>Van Power Profile</h3>

      <table>
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