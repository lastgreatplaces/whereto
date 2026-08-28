"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";




const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceType = "hikes" | "birds" | "camps" | "targets";

const PLACE_TYPE_OPTIONS: { value: PlaceType; label: string }[] = [
  { value: "hikes", label: "Hikes" },
  { value: "birds", label: "Birds" },
  { value: "camps", label: "Camps" },
  { value: "targets", label: "Targets" }
];

export default function AddPlacePage() {
  const [placeType, setPlaceType] = useState<PlaceType>("hikes");
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [subtype, setSubtype] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [openLength, setOpenLength] = useState("");
  const [sitesGain, setSitesGain] = useState("");
  const [elevDifficulty, setElevDifficulty] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const labels = useMemo(() => {
    if (placeType === "hikes") {
      return {
        subtype: "Subtype",
        field1: "Length",
        field2: "Gain",
        field3: "Difficulty",
        subtypePlaceholder: "Day Hike"
      };
    }
    if (placeType === "camps") {
      return {
        subtype: "Subtype",
        field1: "Open",
        field2: "Sites",
        field3: "Elev",
        subtypePlaceholder: "NF, SP, COE, etc."
      };
    }
    if (placeType === "birds") {
      return {
        subtype: "Subtype",
        field1: "Field 1",
        field2: "Field 2",
        field3: "Field 3",
        subtypePlaceholder: "IBA, hotspot, refuge, etc."
      };
    }
    return {
      subtype: "Subtype",
      field1: "Field 1",
      field2: "Field 2",
      field3: "Field 3",
      subtypePlaceholder: "Target type"
    };
  }, [placeType]);

  const clearForm = () => {
    setName("");
    setState("");
    setSubtype("");
    setLat("");
    setLon("");
    setOpenLength("");
    setSitesGain("");
    setElevDifficulty("");
    setWebsite("");
    setNotes("");
    setFavorite(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const trimmedName = name.trim();
    const trimmedState = state.trim().toUpperCase();
    const trimmedSubtype = subtype.trim();
    const trimmedWebsite = website.trim();
    const trimmedNotes = notes.trim();

    if (!trimmedName) {
      setMessage("Name is required.");
      return;
    }

    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      setMessage("Latitude and longitude are required.");
      return;
    }

    if (trimmedWebsite && !/^https?:\/\//i.test(trimmedWebsite)) {
      setMessage("Website must start with http:// or https://");
      return;
    }

    setIsSaving(true);

    const payload = {
      name: trimmedName,
      state: trimmedState || null,
      place_type: placeType,
      subtype: trimmedSubtype || null,
      favorite,
      lon: lonNum,
      lat: latNum,
      website: trimmedWebsite || null,
      open_length: openLength.trim() || null,
      sites_gain: sitesGain.trim() || null,
      elev_difficulty: elevDifficulty.trim() || null,
      notes: trimmedNotes || null
    };

    const { error } = await supabase.from("places").insert([payload]);

    if (error) {
      setMessage(`Save failed: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setMessage("Place saved.");
    clearForm();
    setPlaceType("hikes");
    setIsSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 15,
    borderRadius: 8,
    border: "1px solid #d9d9d9"
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "#555",
    marginBottom: 6
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f7f9",
        fontFamily: "sans-serif",
        padding: 20
      }}
    >
      <div
        style={{
          maxWidth: 700,
          margin: "0 auto",
          background: "white",
          border: "1px solid #d9d9d9",
          borderRadius: 14,
          boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
          padding: 20
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>Add Place</div>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              background: "#f1f3f4",
              color: "#333",
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              padding: "10px 14px",
              fontWeight: 700,
              fontSize: 14
            }}
          >
            Return to Main Menu
          </Link>
        </div>

        <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={labelStyle}>Place type</div>
            <select
              value={placeType}
              onChange={(e) => setPlaceType(e.target.value as PlaceType)}
              style={inputStyle}
            >
              {PLACE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={labelStyle}>State</div>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={inputStyle}
                placeholder="SD"
                maxLength={2}
              />
            </div>
            <div>
              <div style={labelStyle}>{labels.subtype}</div>
              <input
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
                style={inputStyle}
                placeholder={labels.subtypePlaceholder}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={labelStyle}>Latitude</div>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={inputStyle}
                placeholder="44.12345"
              />
            </div>
            <div>
              <div style={labelStyle}>Longitude</div>
              <input
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                style={inputStyle}
                placeholder="-103.12345"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <div style={labelStyle}>{labels.field1}</div>
              <input
                value={openLength}
                onChange={(e) => setOpenLength(e.target.value)}
                style={inputStyle}
                placeholder={placeType === "hikes" ? "5.2 mi" : ""}
              />
            </div>
            <div>
              <div style={labelStyle}>{labels.field2}</div>
              <input
                value={sitesGain}
                onChange={(e) => setSitesGain(e.target.value)}
                style={inputStyle}
                placeholder={placeType === "hikes" ? "1500 ft" : ""}
              />
            </div>
            <div>
              <div style={labelStyle}>{labels.field3}</div>
              <input
                value={elevDifficulty}
                onChange={(e) => setElevDifficulty(e.target.value)}
                style={inputStyle}
                placeholder={placeType === "hikes" ? "Moderate" : ""}
              />
            </div>
          </div>

          <div>
            <div style={labelStyle}>Website</div>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              style={inputStyle}
              placeholder="https://..."
            />
          </div>

          <div>
            <div style={labelStyle}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Set as priority star
          </label>

          {message ? (
            <div style={{ fontSize: 14, color: message.startsWith("Save failed") ? "#b3261e" : "#188038" }}>
              {message}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: "#1a73e8",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "12px 18px",
                fontWeight: 700,
                fontSize: 15,
                cursor: isSaving ? "default" : "pointer",
                opacity: isSaving ? 0.7 : 1
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={clearForm}
              disabled={isSaving}
              style={{
                background: "#f1f3f4",
                color: "#333",
                border: "1px solid #d9d9d9",
                borderRadius: 10,
                padding: "12px 18px",
                fontWeight: 700,
                fontSize: 15,
                cursor: isSaving ? "default" : "pointer"
              }}
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
