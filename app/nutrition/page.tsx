"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type FoodRow = {
  list_order: number;
  category: string | null;
  food_name: string;
  sodium_mg: number;
  sat_fat_g: number;
  qty_today: number;
};

type TodayTotals = {
  sodium_mg: number;
  sat_fat_g: number;
};

type Averages = {
  avg_7day_sodium_mg: number;
  avg_7day_sat_fat_g: number;
  avg_30day_sodium_mg: number;
  avg_30day_sat_fat_g: number;
};

const SAT_FAT_TARGET = 15;
const SODIUM_TARGET = 2000;

function todayLocalDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function num(v: any) {
  return Number(v ?? 0);
}

export default function NutritionPage() {
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [totals, setTotals] = useState<TodayTotals>({
    sodium_mg: 0,
    sat_fat_g: 0
  });
  const [averages, setAverages] = useState<Averages>({
    avg_7day_sodium_mg: 0,
    avg_7day_sat_fat_g: 0,
    avg_30day_sodium_mg: 0,
    avg_30day_sat_fat_g: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);

    const { data: foodData, error: foodError } = await supabase
      .from("nutrition_foods_today")
      .select("*")
      .order("list_order");

    if (foodError) {
      console.error("Error loading foods:", foodError);
    } else {
      setFoods((foodData ?? []) as FoodRow[]);
    }

    const { data: totalData, error: totalError } = await supabase
      .from("nutrition_today_totals")
      .select("*")
      .single();

    if (totalError) {
      console.error("Error loading totals:", totalError);
    } else if (totalData) {
      setTotals({
        sodium_mg: num(totalData.sodium_mg),
        sat_fat_g: num(totalData.sat_fat_g)
      });
    }

    const { data: avgData, error: avgError } = await supabase
      .from("nutrition_averages")
      .select("*")
      .single();

    if (avgError) {
      console.error("Error loading averages:", avgError);
    } else if (avgData) {
      setAverages({
        avg_7day_sodium_mg: num(avgData.avg_7day_sodium_mg),
        avg_7day_sat_fat_g: num(avgData.avg_7day_sat_fat_g),
        avg_30day_sodium_mg: num(avgData.avg_30day_sodium_mg),
        avg_30day_sat_fat_g: num(avgData.avg_30day_sat_fat_g)
      });
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function changeQty(foodId: number, currentQty: number, delta: number) {
    const newQty = Math.max(0, Number(currentQty ?? 0) + delta);

    const { error } = await supabase
      .from("nutrition_log")
      .upsert(
        {
          log_date: todayLocalDate(),
          food_id: foodId,
          qty: newQty
        },
        { onConflict: "log_date,food_id" }
      );

    if (error) {
      console.error("Error updating nutrition log:", error);
      alert(`Could not update food item: ${error.message}`);
      return;
    }

    await loadData();
  }

  const groupedFoods = useMemo(() => {
    const groups: Record<string, FoodRow[]> = {};

    foods.forEach((f) => {
      const cat = f.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });

    return groups;
  }, [foods]);

  const satPct = Math.round((totals.sat_fat_g / SAT_FAT_TARGET) * 100);
  const sodiumPct = Math.round((totals.sodium_mg / SODIUM_TARGET) * 100);

  return (
    <div style={{ padding: 12, fontSize: 14 }}>
      <div style={{ marginBottom: 12 }}>
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
      </div>

      <h2 style={{ marginTop: 4, marginBottom: 10 }}>Nutrition</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          marginBottom: 14
        }}
      >
        <div style={cardStyle}>
          <div style={labelStyle}>Today Sat Fat</div>
          <div style={bigNumberStyle}>{totals.sat_fat_g.toFixed(1)} g</div>
          <div>{SAT_FAT_TARGET} g max · {satPct}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Today Sodium</div>
          <div style={bigNumberStyle}>{Math.round(totals.sodium_mg)} mg</div>
          <div>{SODIUM_TARGET} mg max · {sodiumPct}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>7-Day Average</div>
          <div>Sat Fat: {averages.avg_7day_sat_fat_g.toFixed(1)} g</div>
          <div>Sodium: {Math.round(averages.avg_7day_sodium_mg)} mg</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>30-Day Average</div>
          <div>Sat Fat: {averages.avg_30day_sat_fat_g.toFixed(1)} g</div>
          <div>Sodium: {Math.round(averages.avg_30day_sodium_mg)} mg</div>
        </div>
      </div>

      {isLoading && <div>Loading...</div>}

      {Object.entries(groupedFoods).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 8 }}>{category}</h3>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {items.map((f) => (
                <tr key={f.list_order} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ width: 38, padding: "6px 2px" }}>
                    <button
                      onClick={() => changeQty(f.list_order, f.qty_today, -1)}
                      style={buttonStyle}
                    >
                      −
                    </button>
                  </td>

                  <td style={{ width: 36, textAlign: "center", fontWeight: 700 }}>
                    {Number(f.qty_today ?? 0)}
                  </td>

                  <td style={{ width: 38, padding: "6px 2px" }}>
                    <button
                      onClick={() => changeQty(f.list_order, f.qty_today, 1)}
                      style={buttonStyle}
                    >
                      +
                    </button>
                  </td>

                  <td style={{ padding: "6px 8px" }}>{f.food_name}</td>

                  <td style={{ width: 90, textAlign: "right", color: "#555" }}>
                    {Number(f.sat_fat_g ?? 0).toFixed(1)} g
                  </td>

                  <td style={{ width: 90, textAlign: "right", color: "#555" }}>
                    {Math.round(Number(f.sodium_mg ?? 0))} mg
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
<div style={{ marginTop: 24 }}>
  <h3 style={{ marginBottom: 8 }}>Eaten Today</h3>

  {foods.filter((f) => Number(f.qty_today ?? 0) > 0).length === 0 ? (
    <div style={{ color: "#666" }}>Nothing logged yet today.</div>
  ) : (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <tbody>
        {foods
          .filter((f) => Number(f.qty_today ?? 0) > 0)
          .map((f) => (
            <tr key={`eaten-${f.list_order}`} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "6px 8px", fontWeight: 700, width: 40 }}>
                {Number(f.qty_today)}
              </td>

              <td style={{ padding: "6px 8px" }}>{f.food_name}</td>

              <td style={{ width: 90, textAlign: "right", color: "#555" }}>
                {(Number(f.qty_today) * Number(f.sat_fat_g ?? 0)).toFixed(1)} g
              </td>

              <td style={{ width: 90, textAlign: "right", color: "#555" }}>
                {Math.round(Number(f.qty_today) * Number(f.sodium_mg ?? 0))} mg
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )}
</div>

    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "#fafafa"
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
  fontWeight: 700
};

const bigNumberStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  marginBottom: 4
};

const buttonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f7f7f7",
  fontWeight: 800,
  cursor: "pointer"
};