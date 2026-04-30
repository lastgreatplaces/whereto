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
  battery_pct_7pm: number | null;
  forecast_7pm_pct: number | null;

  plan_drive: number | null;
  actual_drive: number | null;

  plan_condition: string | null;
  actual_condition: string | null;

  plan_shore: boolean | null;
  actual_shore: boolean | null;

  plan_h2o: boolean | null;
  actual_h2o: boolean | null;
};

export default function VanPowerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const tripName = "Spring Migration 2026";

  async function loadData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("v_power_trip_forecast_7pm")
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
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 12 }}>
        Van Power — {tripName}
      </div>

      {loading && <div>Loading...</div>}

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th>Date</th>
            <th>7AM</th>
            <th>7PM</th>
            <th>Forecast</th>

            <th>Plan Drive</th>
            <th>Actual Drive</th>

            <th>Plan Wx</th>
            <th>Actual Wx</th>

            <th>Shore</th>
            <th>H2O</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.trip_date} style={{ borderBottom: "1px solid #eee" }}>
              <td>{r.date_label}</td>

              <td>
                <input
                  type="number"
                  value={r.battery_pct_7am ?? ""}
                  onChange={(e) =>
                    updateField(
                      r.trip_date,
                      "battery_pct_7am",
                      Number(e.target.value)
                    )
                  }
                  style={{ width: 60 }}
                />
              </td>

              <td style={{ fontWeight: 700 }}>
                <input
                  type="number"
                  value={r.battery_pct_7pm ?? ""}
                  onChange={(e) =>
                    updateField(
                      r.trip_date,
                      "battery_pct_7pm",
                      Number(e.target.value)
                    )
                  }
                  style={{ width: 60 }}
                />
              </td>

              <td style={{ fontWeight: 700, color: "#1565c0" }}>
                {r.forecast_7pm_pct ?? ""}
              </td>

              <td>
                <input
                  type="number"
                  value={r.plan_drive ?? ""}
                  onChange={(e) =>
                    updateField(
                      r.trip_date,
                      "driving_hours",
                      Number(e.target.value)
                    )
                  }
                  style={{ width: 60 }}
                />
              </td>

              <td>
                <input
                  type="number"
                  value={r.actual_drive ?? ""}
                  onChange={(e) =>
                    updateField(
                      r.trip_date,
                      "actual_driving_hours",
                      Number(e.target.value)
                    )
                  }
                  style={{ width: 60 }}
                />
              </td>

              <td>
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

              <td>
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

              <td>
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

              <td>
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
  );
}