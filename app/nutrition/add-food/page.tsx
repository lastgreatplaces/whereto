"use client";

import { useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";

const categories = ["Breakfast", "Lunch", "Snacks", "Dinner", "Items"];

function num(v: string) {
  return Number(v || 0);
}

export default function AddFoodPage() {
  const router = useRouter();

  const [foodName, setFoodName] = useState("");
  const [category, setCategory] = useState("Breakfast");
  const [satFat, setSatFat] = useState("");
  const [sodium, setSodium] = useState("");
  const [protein, setProtein] = useState("");
  const [fiber, setFiber] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveFood() {
    if (!foodName.trim()) {
      alert("Food name is required.");
      return;
    }

    setIsSaving(true);

    const { data: maxRows, error: maxError } = await supabase
      .from("nutrition_foods")
      .select("list_order")
      .order("list_order", { ascending: false })
      .limit(1);

    if (maxError) {
      alert(`Could not get next food ID: ${maxError.message}`);
      setIsSaving(false);
      return;
    }

    const nextListOrder = Number(maxRows?.[0]?.list_order ?? 0) + 1;

    const { error } = await supabase.from("nutrition_foods").insert({
      list_order: nextListOrder,
      category,
      food_name: foodName.trim(),
      sat_fat_g: num(satFat),
      sodium_mg: num(sodium),
      protein_g: num(protein),
      fiber_g: num(fiber)
    });

    if (error) {
      alert(`Could not save food: ${error.message}`);
      setIsSaving(false);
      return;
    }

    router.push("/nutrition");
  }

  return (
    <div style={{ padding: 12, fontSize: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/nutrition" style={buttonStyle}>
          ← Nutrition
        </Link>
      </div>

      <h2 style={{ marginTop: 4, fontWeight: 800 }}>Add Food</h2>

      <label style={labelStyle}>Food Name</label>
      <input
        value={foodName}
        onChange={(e) => setFoodName(e.target.value)}
        style={inputStyle}
        placeholder="Greek yogurt"
      />

      <label style={labelStyle}>Category</label>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            style={{
              ...categoryButtonStyle,
              background: category === c ? "#e8f2ff" : "#f7f7f7",
              border: category === c ? "2px solid #4a90e2" : "1px solid #ccc"
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Sat Fat g</label>
      <input
        value={satFat}
        onChange={(e) => setSatFat(e.target.value)}
        inputMode="decimal"
        style={inputStyle}
      />

      <label style={labelStyle}>Sodium mg</label>
      <input
        value={sodium}
        onChange={(e) => setSodium(e.target.value)}
        inputMode="decimal"
        style={inputStyle}
      />

      <label style={labelStyle}>Protein g</label>
      <input
        value={protein}
        onChange={(e) => setProtein(e.target.value)}
        inputMode="decimal"
        style={inputStyle}
      />

      <label style={labelStyle}>Fiber g</label>
      <input
        value={fiber}
        onChange={(e) => setFiber(e.target.value)}
        inputMode="decimal"
        style={inputStyle}
      />

      <button
        type="button"
        onClick={saveFood}
        disabled={isSaving}
        style={{
          ...buttonStyle,
          width: "100%",
          marginTop: 12,
          fontSize: 16,
          opacity: isSaving ? 0.65 : 1
        }}
      >
        {isSaving ? "Saving..." : "Save Food"}
      </button>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontWeight: 700,
  marginTop: 10,
  marginBottom: 4
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 16,
  boxSizing: "border-box"
};

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f7f7f7",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  cursor: "pointer"
};

const categoryButtonStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer"
};