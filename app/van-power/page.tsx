"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const tripName = "Spring Migration 2026";

  async function loadData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("v_power_trip_window")
      .select("*")
      .eq("trip_name", tripName)
      .order("trip_date");

    if (error) {
      console.error(error);
    } else {
      setRows(data as Row[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function updateField(date: string, field: string, value: any) {
    await supabase
      .from("power_trip_days")
      .update({ [field]: value })
      .eq("trip_date", date);

    loadData();
  }

  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>
        Van Power — {tripName}
      </div>

      {loading && <div>Loading...</div>}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: 13
          }}
        >
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ textAlign: "left" }}>Date</th>

              <th style={{ textAlign: "right" }}>7AM</th>
              <th style={{ textAlign: "right" }}>7PM</th>
              <th style={{ textAlign: "right" }}>Forecast</th>
              <th style={{ textAlign: "right" }}>Δ</th>

              {/* DRIVE GROUP */}
              <th style={{ textAlign: "right", paddingLeft: 12 }}>Plan</th>
              <th style={{ textAlign: "right" }}>Actual</th>

              {/* WEATHER GROUP */}
              <th style={{ textAlign: "left", paddingLeft: 12 }}>Plan Wx</th>
              <th style={{ textAlign: "left" }}>Actual Wx</th>

              <th style={{ textAlign: "center", paddingLeft: 12 }}>Shore</th>
              <th style={{ textAlign: "center" }}>H2O</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const isTodayRow =
                r.actual_7pm_pct == null && r.battery_pct_7am != null;

              return (
                <tr
                  key={r.trip_date}
                  style={{
                    borderBottom: "1px solid #eee",
                    background: isTodayRow ? "#fff8e1" : "transparent"
                  }}
                >
                  {/* DATE */}
                  <td style={{ textAlign: "left" }}>{r.date_label}</td>

                  {/* 7AM */}
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.battery_pct_7am ?? ""}
                      onChange={(e) =>
                        updateField(
                          r.trip_date,
                          "battery_pct_7am",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: 50, textAlign: "right" }}
                    />
                  </td>

                  {/* 7PM ACTUAL */}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.actual_7pm_pct ?? ""}
                      onChange={(e) =>
                        updateField(
                          r.trip_date,
                          "battery_pct_7pm",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: 50, textAlign: "right" }}
                    />
                  </td>

                  {/* FORECAST */}
                  <td
                    style={{
                      textAlign: "right",
                      color: "#1565c0",
                      fontWeight: 700
                    }}
                  >
                    {r.forecast_7pm_pct ?? ""}
                  </td>

                  {/* DIFF */}
                  <td
                    style={{
                      textAlign: "right",
                      color:
                        r.pct_diff == null
                          ? "#999"
                          : r.pct_diff >= 0
                          ? "green"
                          : "red"
                    }}
                  >
                    {r.pct_diff ?? ""}
                  </td>

                  {/* PLAN DRIVE */}
                  <td style={{ textAlign: "right", paddingLeft: 12 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.plan_drive ?? ""}
                      onChange={(e) =>
                        updateField(
                          r.trip_date,
                          "driving_hours",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: 50, textAlign: "right" }}
                    />
                  </td>

                  {/* ACTUAL DRIVE */}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.actual_drive ?? ""}
                      onChange={(e) =>
                        updateField(
                          r.trip_date,
                          "actual_driving_hours",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: 50, textAlign: "right" }}
                    />
                  </td>

                  {/* PLAN WX */}
                  <td style={{ textAlign: "left", paddingLeft: 12 }}>
                    <select
                      value={r.plan_condition ?? ""}
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

                  {/* ACTUAL WX */}
                  <td style={{ textAlign: "left", fontWeight: 600 }}>
                    <select
                      value={r.actual_condition ?? ""}
                      onChange={(e) =>
                        updateField(
                          r.trip_date,
                          "actual_condition_text",
                          e.target.value
                        )
                      }
                    >
                      <option value=""></option>
                      <option>Sunny</option>
                      <option>Partly Sunny</option>
                      <option>Cloudy</option>
                    </select>
                  </td>

                  {/* SHORE */}
                  <td style={{ textAlign: "center", paddingLeft: 12 }}>
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

                  {/* HOT WATER */}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}