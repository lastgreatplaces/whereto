"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type TripRow = {
  id: number;
  trip_name: string;
  start_date: string | null;
  end_date: string | null;
};

export default function VanPowerPage() {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({});
  const [showAll, setShowAll] = useState(false);

  const [isNewTripOpen, setIsNewTripOpen] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [newTripStartDate, setNewTripStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);

  const [isEndTripOpen, setIsEndTripOpen] = useState(false);
  const [endTripDate, setEndTripDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [isEndingTrip, setIsEndingTrip] = useState(false);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) ?? null,
    [trips, selectedTripId]
  );

  async function loadTrips() {
    const { data, error } = await supabase
      .from("power_trips")
      .select("id, trip_name, start_date, end_date")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error loading trips:", error);
      return;
    }

    const tripRows = (data ?? []) as TripRow[];
    setTrips(tripRows);

    if (!selectedTripId && tripRows.length > 0) {
      setSelectedTripId(tripRows[0].id);
    }
  }

  async function loadData(tripId?: number | null, tripEndDate?: string | null) {
    const effectiveTripId = tripId ?? selectedTripId;
    const effectiveEndDate =
      tripEndDate !== undefined ? tripEndDate : selectedTrip?.end_date ?? null;

    if (!effectiveTripId) {
      setRows([]);
      return;
    }

    let query = supabase
      .from("v_power_trip_forecast_7pm")
      .select("*")
      .eq("trip_id", effectiveTripId)
      .order("trip_date");

    if (effectiveEndDate) {
      query = query.lte("trip_date", effectiveEndDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error loading trip data:", error);
      return;
    }

    setRows(data ?? []);
  }

  async function loadDevices() {
    const { data, error } = await supabase
      .from("power_profile_devices")
      .select("*")
      .order("id");

    if (error) {
      console.error("Error loading devices:", error);
      return;
    }

    setDevices(data ?? []);
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("power_profiles")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Error loading power profile:", error);
      return;
    }

    setProfile(data ?? {});
  }

  useEffect(() => {
    loadTrips();
    loadDevices();
    loadProfile();
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadData(selectedTripId);
    }
  }, [selectedTripId, selectedTrip?.end_date]);

  useEffect(() => {
    if (selectedTrip?.end_date) {
      setEndTripDate(selectedTrip.end_date);
    } else {
      const d = new Date();
      setEndTripDate(d.toISOString().slice(0, 10));
    }
  }, [selectedTripId, selectedTrip?.end_date]);

  async function updateField(tripId: number, date: string, field: string, value: any) {
    const { error } = await supabase
      .from("power_trip_days")
      .update({ [field]: value })
      .eq("trip_id", tripId)
      .eq("trip_date", date);

    if (error) {
      console.error(`Error updating ${field}:`, error);
      return;
    }

    loadData(tripId);
  }

  async function updateDevice(id: number, field: string, value: any) {
    const { error } = await supabase
      .from("power_profile_devices")
      .update({ [field]: value })
      .eq("id", id);

    if (error) {
      console.error(`Error updating device ${field}:`, error);
      return;
    }

    await loadDevices();
    await loadData();
  }

  async function updateProfile(field: string, value: any) {
    const { error } = await supabase
      .from("power_profiles")
      .update({ [field]: value })
      .eq("id", 1);

    if (error) {
      console.error(`Error updating profile ${field}:`, error);
      return;
    }

    await loadProfile();
    await loadData();
  }

  async function createNewTrip() {
    const tripName = newTripName.trim();
    if (!tripName) {
      alert("Enter a trip name.");
      return;
    }

    if (!newTripStartDate) {
      alert("Choose a trip start date.");
      return;
    }

    setIsCreatingTrip(true);

    try {
      const { data: tripData, error: tripError } = await supabase
  .from("power_trips")
  .insert([
    {
      trip_name: tripName,
      profile_id: 1,
      start_date: newTripStartDate,
      end_date: null
    }
  ])
  .select("id, trip_name, start_date, end_date")
  .single();

      if (tripError || !tripData) {
        console.error("Error creating trip:", tripError);
        alert(`Could not create trip: ${tripError?.message ?? "Unknown error"}`);
        return;
      }

      const start = new Date(`${newTripStartDate}T00:00:00`);
      const dayRows = Array.from({ length: 60 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return {
          trip_id: tripData.id,
          trip_date: d.toISOString().slice(0, 10),
          row_type: "projected",
          condition_text: "Cloudy",
          driving_hours: 0,
          night_shore_power: false,
          day_hot_water: false,
          notes: null
        };
      });

      const { error: dayError } = await supabase
        .from("power_trip_days")
        .insert(dayRows);

      if (dayError) {
        console.error("Error seeding trip days:", dayError);
        alert(`Trip created, but could not seed trip days: ${dayError.message}`);
        return;
      }

      await loadTrips();
      setSelectedTripId(tripData.id);
      setNewTripName("");
      setNewTripStartDate(new Date().toISOString().slice(0, 10));
      setIsNewTripOpen(false);
    } finally {
      setIsCreatingTrip(false);
    }
  }

  async function saveTripEndDate() {
    if (!selectedTripId || !endTripDate) return;

    setIsEndingTrip(true);
    try {
      const { error } = await supabase
        .from("power_trips")
        .update({ end_date: endTripDate })
        .eq("id", selectedTripId);

      if (error) {
        console.error("Error ending trip:", error);
        alert(`Could not end trip: ${error.message}`);
        return;
      }

      await loadTrips();
      await loadData(selectedTripId, endTripDate);
      setIsEndTripOpen(false);
    } finally {
      setIsEndingTrip(false);
    }
  }

  async function clearTripEndDate() {
    if (!selectedTripId) return;

    setIsEndingTrip(true);
    try {
      const { error } = await supabase
        .from("power_trips")
        .update({ end_date: null })
        .eq("id", selectedTripId);

      if (error) {
        console.error("Error clearing trip end:", error);
        alert(`Could not clear end date: ${error.message}`);
        return;
      }

      await loadTrips();
      await loadData(selectedTripId, null);
      setIsEndTripOpen(false);
    } finally {
      setIsEndingTrip(false);
    }
  }

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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginBottom: 12
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d0d0d0",
            background: "#f7f7f7",
            textDecoration: "none",
            color: "#111",
            fontWeight: 600
          }}
        >
          ← Home
        </Link>

        <div style={{ fontWeight: 700 }}>Trip</div>

        <select
          value={selectedTripId ?? ""}
          onChange={(e) => setSelectedTripId(Number(e.target.value))}
          style={{
            minWidth: 240,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d0d0d0"
          }}
        >
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.trip_name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setIsNewTripOpen((v) => !v)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d0d0d0",
            background: "#f7f7f7",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          + New Trip
        </button>

        <button
          onClick={() => setIsEndTripOpen((v) => !v)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d0d0d0",
            background: "#f7f7f7",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          End Trip
        </button>
      </div>

      {isNewTripOpen && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fafafa",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "end"
          }}
        >
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Trip Name</div>
            <input
              value={newTripName}
              onChange={(e) => setNewTripName(e.target.value)}
              placeholder="New trip name"
              style={{
                width: 220,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d0d0d0"
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Start Date</div>
            <input
              type="date"
              value={newTripStartDate}
              onChange={(e) => setNewTripStartDate(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d0d0d0"
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: "#666", paddingBottom: 8 }}>
            Seeds 60 days
          </div>

          <button
            onClick={createNewTrip}
            disabled={isCreatingTrip}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d0d0d0",
              background: isCreatingTrip ? "#eee" : "#e8f3ff",
              fontWeight: 600,
              cursor: isCreatingTrip ? "default" : "pointer"
            }}
          >
            {isCreatingTrip ? "Creating..." : "Create Trip"}
          </button>
        </div>
      )}

      {isEndTripOpen && selectedTrip && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fafafa",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "end"
          }}
        >
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>End Date</div>
            <input
              type="date"
              value={endTripDate}
              onChange={(e) => setEndTripDate(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d0d0d0"
              }}
            />
          </div>

          <button
            onClick={saveTripEndDate}
            disabled={isEndingTrip}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d0d0d0",
              background: isEndingTrip ? "#eee" : "#fff2e8",
              fontWeight: 600,
              cursor: isEndingTrip ? "default" : "pointer"
            }}
          >
            {isEndingTrip ? "Saving..." : "Save End Date"}
          </button>

          {selectedTrip.end_date && (
            <button
              onClick={clearTripEndDate}
              disabled={isEndingTrip}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #d0d0d0",
                background: "#f7f7f7",
                fontWeight: 600,
                cursor: isEndingTrip ? "default" : "pointer"
              }}
            >
              Clear End Date
            </button>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 4, marginBottom: 10 }}>
        Van Power — {selectedTrip?.trip_name ?? "No trip selected"}
      </h2>

      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d0d0d0",
            background: "#f7f7f7",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {showAll ? "Show 10-Day Window" : "Show Full History"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 1150, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 80 }}>Date</th>
              <th style={{ width: 50 }}>7A</th>
              <th style={{ width: 50 }}>7P</th>
              <th style={{ width: 55, color: "#1565c0" }}>For</th>
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
            {filteredRows.map((r) => (
              <tr key={`${r.trip_id}-${r.trip_date}`}>
                <td>{r.date_label}</td>

                <td>
                  <input
                    style={{ width: 45, textAlign: "right" }}
                    defaultValue={r.battery_pct_7am ?? ""}
                    onBlur={(e) =>
                      updateField(
                        r.trip_id,
                        r.trip_date,
                        "battery_pct_7am",
                        e.target.value === "" ? null : parseInt(e.target.value)
                      )
                    }
                  />
                </td>

                <td>
                  <input
                    style={{ width: 45, textAlign: "right" }}
                    defaultValue={r.actual_7pm_pct ?? ""}
                    onBlur={(e) =>
                      updateField(
                        r.trip_id,
                        r.trip_date,
                        "battery_pct_7pm",
                        e.target.value === "" ? null : parseInt(e.target.value)
                      )
                    }
                  />
                </td>

                <td
                  style={{
                    fontWeight: 700,
                    textAlign: "right",
                    color:
                      r.forecast_7pm_pct < 20
                        ? "red"
                        : r.forecast_7pm_pct < 40
                        ? "orange"
                        : "#1565c0"
                  }}
                >
                  {r.forecast_7pm_pct}
                </td>

                <td>
                  <input
                    style={{ width: 50, textAlign: "right" }}
                    defaultValue={
                      r.plan_drive != null ? Number(r.plan_drive).toFixed(1) : ""
                    }
                    onBlur={(e) =>
                      updateField(
                        r.trip_id,
                        r.trip_date,
                        "driving_hours",
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )
                    }
                  />
                </td>

                <td>
                  <select
                    value={r.plan_condition || ""}
                    onChange={(e) =>
                      updateField(r.trip_id, r.trip_date, "condition_text", e.target.value)
                    }
                  >
                    <option>Sunny</option>
                    <option>Partly Sunny</option>
                    <option>Cloudy</option>
                  </select>
                </td>

                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.plan_shore || false}
                    onChange={(e) =>
                      updateField(
                        r.trip_id,
                        r.trip_date,
                        "night_shore_power",
                        e.target.checked
                      )
                    }
                  />
                </td>

                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.plan_h2o || false}
                    onChange={(e) =>
                      updateField(
                        r.trip_id,
                        r.trip_date,
                        "day_hot_water",
                        e.target.checked
                      )
                    }
                  />
                </td>

                <td style={{ textAlign: "right" }}>{r.solar_wh}</td>
                <td style={{ textAlign: "right" }}>{r.driving_wh}</td>
                <td style={{ textAlign: "right" }}>{r.shore_wh}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{r.total_wh}</td>
                <td style={{ textAlign: "center" }}>{r.trip_day}</td>

                <td>
                  <input
                    style={{ width: "100%", minWidth: 220 }}
                    defaultValue={r.notes || ""}
                    onBlur={(e) =>
                      updateField(r.trip_id, r.trip_date, "notes", e.target.value)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              d.enabled ? (d.avg_watts * d.mins_per_use * d.uses_per_day) / 60 : 0;

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
                  return sum + (d.avg_watts * d.mins_per_use * d.uses_per_day) / 60;
                }, 0)
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>Van Power Profile</h3>

      <table>
        <tbody>
          <tr>
            <td>Season</td>
            <td>
              <select
                value={profile.season || ""}
                onChange={(e) => updateProfile("season", e.target.value)}
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
                onChange={(e) => updateProfile("latitude_band", e.target.value)}
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
                onBlur={(e) => updateProfile("solar_watts", Number(e.target.value))}
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
                  updateProfile("shore_charge_amps", Number(e.target.value))
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
                  updateProfile("shore_power_hours", Number(e.target.value))
                }
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}