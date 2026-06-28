"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";


type FoodBaseRow = {
  list_order: number;
  category: string | null;
  food_name: string;
  sodium_mg: number;
  sat_fat_g: number;
  protein_g: number;
  fiber_g: number;
  benefit_cost_ratio: number | null;
};

type FoodRow = FoodBaseRow & {
  qty_today: number;
};

type LogRow = {
  food_id: number;
  qty: number;
};

type TodayTotals = {
  sodium_mg: number;
  sat_fat_g: number;
  protein_g: number;
  fiber_g: number;
};

type Averages = {
  avg_7day_sodium_mg: number;
  avg_7day_sat_fat_g: number;
  avg_7day_protein_g: number;
  avg_7day_fiber_g: number;
  avg_30day_sodium_mg: number;
  avg_30day_sat_fat_g: number;
  avg_30day_protein_g: number;
  avg_30day_fiber_g: number;
};

type EatenSort = "food" | "satFat" | "sodium" | "protein" | "fiber";
type FoodListSort = "food" | "roi";


const SAT_FAT_TARGET = 15;
const SODIUM_TARGET = 2000;
const PROTEIN_TARGET = 100;
const FIBER_TARGET = 30;

function todayLocalDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function displayDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function num(v: any) {
  return Number(v ?? 0);
}

export default function NutritionPage() {
  const [selectedDate, setSelectedDate] = useState(todayLocalDate());
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [eatenSort, setEatenSort] = useState<EatenSort>("food");
  const [foodListSort, setFoodListSort] = useState<FoodListSort>("food");

  const [totals, setTotals] = useState<TodayTotals>({
    sodium_mg: 0,
    sat_fat_g: 0,
    protein_g: 0,
    fiber_g: 0
  });

  const [averages, setAverages] = useState<Averages>({
    avg_7day_sodium_mg: 0,
    avg_7day_sat_fat_g: 0,
    avg_7day_protein_g: 0,
    avg_7day_fiber_g: 0,
    avg_30day_sodium_mg: 0,
    avg_30day_sat_fat_g: 0,
    avg_30day_protein_g: 0,
    avg_30day_fiber_g: 0
  });

  const [isLoading, setIsLoading] = useState(true);

  async function loadData(dateToLoad = selectedDate) {
    setIsLoading(true);

    const { data: foodData, error: foodError } = await supabase
      .from("v_nutrition_foods_roi")
      .select(
        "list_order, category, food_name, sodium_mg, sat_fat_g, protein_g, fiber_g, benefit_cost_ratio"
      )
      .order("list_order");

    if (foodError) {
      console.error("Error loading foods:", foodError);
      setIsLoading(false);
      return;
    }

    const { data: logData, error: logError } = await supabase
      .from("nutrition_log")
      .select("food_id, qty")
      .eq("log_date", dateToLoad);

    if (logError) {
      console.error("Error loading log:", logError);
      setIsLoading(false);
      return;
    }

    const logMap: Record<number, number> = {};
    ((logData ?? []) as LogRow[]).forEach((r) => {
      logMap[r.food_id] = Number(r.qty ?? 0);
    });

    const mergedFoods = ((foodData ?? []) as FoodBaseRow[]).map((f) => ({
      ...f,
      qty_today: logMap[f.list_order] ?? 0
    }));

    setFoods(mergedFoods);

    const selectedTotals = mergedFoods.reduce(
      (sum, f) => {
        sum.sodium_mg += Number(f.qty_today) * Number(f.sodium_mg ?? 0);
        sum.sat_fat_g += Number(f.qty_today) * Number(f.sat_fat_g ?? 0);
        sum.protein_g += Number(f.qty_today) * Number(f.protein_g ?? 0);
        sum.fiber_g += Number(f.qty_today) * Number(f.fiber_g ?? 0);
        return sum;
      },
      { sodium_mg: 0, sat_fat_g: 0, protein_g: 0, fiber_g: 0 }
    );

    setTotals(selectedTotals);

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
        avg_7day_protein_g: num(avgData.avg_7day_protein_g),
        avg_7day_fiber_g: num(avgData.avg_7day_fiber_g),
        avg_30day_sodium_mg: num(avgData.avg_30day_sodium_mg),
        avg_30day_sat_fat_g: num(avgData.avg_30day_sat_fat_g),
        avg_30day_protein_g: num(avgData.avg_30day_protein_g),
        avg_30day_fiber_g: num(avgData.avg_30day_fiber_g)
      });
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  async function changeQty(foodId: number, currentQty: number, delta: number) {
    const newQty = Math.max(0, Number(currentQty ?? 0) + delta);

    if (newQty === 0) {
      const { error } = await supabase
        .from("nutrition_log")
        .delete()
        .eq("log_date", selectedDate)
        .eq("food_id", foodId);

      if (error) {
        console.error("Error deleting nutrition log row:", error);
        alert(`Could not remove food item: ${error.message}`);
        return;
      }

      await loadData(selectedDate);
      return;
    }

    const { error } = await supabase
      .from("nutrition_log")
      .upsert(
        {
          log_date: selectedDate,
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

    await loadData(selectedDate);
  }

  const groupedFoods = useMemo(() => {
    const groups: Record<string, FoodRow[]> = {};

    foods.forEach((f) => {
      const cat = f.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });

    Object.keys(groups).forEach((cat) => {
      groups[cat].sort((a, b) => {
        if (foodListSort === "roi") {
          return Number(b.benefit_cost_ratio ?? 0) - Number(a.benefit_cost_ratio ?? 0);
        }

        return a.list_order - b.list_order;
      });
    });

    return groups;
  }, [foods, foodListSort]);

  const eatenToday = useMemo(() => {
    return foods
      .filter((f) => Number(f.qty_today ?? 0) > 0)
      .sort((a, b) => {
        if (eatenSort === "satFat") {
          return Number(b.qty_today) * Number(b.sat_fat_g ?? 0) -
            Number(a.qty_today) * Number(a.sat_fat_g ?? 0);
        }

        if (eatenSort === "sodium") {
          return Number(b.qty_today) * Number(b.sodium_mg ?? 0) -
            Number(a.qty_today) * Number(a.sodium_mg ?? 0);
        }

        if (eatenSort === "protein") {
          return Number(b.qty_today) * Number(b.protein_g ?? 0) -
            Number(a.qty_today) * Number(a.protein_g ?? 0);
        }

        if (eatenSort === "fiber") {
          return Number(b.qty_today) * Number(b.fiber_g ?? 0) -
            Number(a.qty_today) * Number(a.fiber_g ?? 0);
        }

        return a.list_order - b.list_order;
      });
  }, [foods, eatenSort]);

  function sortLabel(key: EatenSort, label: string) {
    return eatenSort === key ? `${label} ▼` : label;
  }

  function foodListSortLabel(key: FoodListSort, label: string) {
    return foodListSort === key ? `${label} ▼` : label;
  }

  function roiColor(roi: number | null) {
    const v = Number(roi ?? 0);
    if (v > 1.5) return "#006400";
    if (v > 1.0) return "green";
    if (v > 0.5) return "orange";
    return "red";
  }

  function scrollToEatenToday() {
    document.getElementById("eaten-today")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  const satPct = Math.round((totals.sat_fat_g / SAT_FAT_TARGET) * 100);
  const sodiumPct = Math.round((totals.sodium_mg / SODIUM_TARGET) * 100);
  const proteinPct = Math.round((totals.protein_g / PROTEIN_TARGET) * 100);
  const fiberPct = Math.round((totals.fiber_g / FIBER_TARGET) * 100);

  return (
    <div style={{ padding: 6, fontSize: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/" style={homeButtonStyle}>
          ← Home
        </Link>
      </div>

      <div style={topRowStyle}>
        <h2
  style={{
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.15,
    whiteSpace: "nowrap"
  }}
>
  Nutrition • {displayDate(selectedDate)}
</h2>

        <button onClick={scrollToEatenToday} style={dateButtonStyle}>
          Eaten
        </button>
      </div>

      <div style={dateRowStyle}>
        <button
          onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
          style={dateButtonStyle}
        >



          ←
        </button>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={dateInputStyle}
        />

        <button
          onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
          style={dateButtonStyle}
        >
          →
        </button>

        <button
          onClick={() => setSelectedDate(todayLocalDate())}
          style={dateButtonStyle}
        >
          Today
        </button>

<Link href="/nutrition/add-food" style={dateButtonStyle}>
  +Food
</Link>


      </div>

      <div style={cardsGridStyle}>
        <div style={costCardStyle}>
          <div style={labelStyle}>Sat Fat</div>
          <div style={compactMetricRowStyle}>
            <div style={compactNumberStyle}>{totals.sat_fat_g.toFixed(1)} g</div>
            <div style={compactTargetStyle}>
              {satPct}% of {SAT_FAT_TARGET} g
            </div>
          </div>
        </div>

        <div style={costCardStyle}>
          <div style={labelStyle}>Sodium</div>
          <div style={compactMetricRowStyle}>
            <div style={compactNumberStyle}>{Math.round(totals.sodium_mg)} mg</div>
            <div style={compactTargetStyle}>
              {sodiumPct}% of {SODIUM_TARGET} mg
            </div>
          </div>
        </div>

        <div style={compactCardStyle}>
          <div style={labelStyle}>Protein</div>
          <div style={compactMetricRowStyle}>
            <div style={compactNumberStyle}>{totals.protein_g.toFixed(0)} g</div>
            <div style={compactTargetStyle}>
              {proteinPct}% of {PROTEIN_TARGET} g
            </div>
          </div>
        </div>

        <div style={compactCardStyle}>
          <div style={labelStyle}>Fiber</div>
          <div style={compactMetricRowStyle}>
            <div style={compactNumberStyle}>{totals.fiber_g.toFixed(0)} g</div>
            <div style={compactTargetStyle}>
              {fiberPct}% of {FIBER_TARGET} g
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>7-Day Average</div>
          <div style={averageGridStyle}>
            <div>Sat Fat: {averages.avg_7day_sat_fat_g.toFixed(1)} g</div>
            <div>Protein: {Math.round(averages.avg_7day_protein_g)} g</div>
            <div>Sodium: {Math.round(averages.avg_7day_sodium_mg)} mg</div>
            <div>Fiber: {averages.avg_7day_fiber_g.toFixed(1)} g</div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>30-Day Average</div>
          <div style={averageGridStyle}>
            <div>Sat Fat: {averages.avg_30day_sat_fat_g.toFixed(1)} g</div>
            <div>Protein: {Math.round(averages.avg_30day_protein_g)} g</div>
            <div>Sodium: {Math.round(averages.avg_30day_sodium_mg)} mg</div>
            <div>Fiber: {averages.avg_30day_fiber_g.toFixed(1)} g</div>
          </div>
        </div>
      </div>

      {isLoading && <div>Loading...</div>}

      {Object.entries(groupedFoods).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 8 }}>{category}</h3>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                minWidth: 720,
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd" }}>
                  <th style={{ width: 38 }}></th>
                  <th style={{ width: 36, textAlign: "center" }}>Qty</th>
                  <th style={{ width: 38 }}></th>

                  <th
                    onClick={() => setFoodListSort("food")}
                    style={{
                      padding: "6px 8px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: foodListSort === "food" ? 800 : 600
                    }}
                  >
                    {foodListSortLabel("food", "Food")}
                  </th>

                  <th
                    onClick={() => setFoodListSort("roi")}
                    style={{
                      width: 58,
                      textAlign: "right",
                      cursor: "pointer",
                      fontWeight: foodListSort === "roi" ? 800 : 600
                    }}
                  >
                    {foodListSortLabel("roi", "ROI")}
                  </th>

                  <th style={nutrientHeaderStyle}>Sat Fat</th>
                  <th style={nutrientHeaderStyle}>Sodium</th>
                  <th style={nutrientHeaderStyle}>Protein</th>
                  <th style={nutrientHeaderStyle}>Fiber</th>
                </tr>
              </thead>

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

                    <td
                      style={{
                        width: 58,
                        textAlign: "right",
                        fontWeight: 800,
                        color: roiColor(f.benefit_cost_ratio)
                      }}
                    >
                      {Number(f.benefit_cost_ratio ?? 0).toFixed(1)}
                    </td>

                    <td style={nutrientCellStyle}>
                      {Number(f.sat_fat_g ?? 0).toFixed(1)} g
                    </td>

                    <td style={nutrientCellStyle}>
                      {Math.round(Number(f.sodium_mg ?? 0))} mg
                    </td>

                    <td style={nutrientCellStyle}>
                      {Number(f.protein_g ?? 0).toFixed(0)} g
                    </td>

                    <td style={nutrientCellStyle}>
                      {Number(f.fiber_g ?? 0).toFixed(0)} g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div id="eaten-today" style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8, fontWeight: 800 }}>Eaten Today</h3>

        {eatenToday.length === 0 ? (
          <div style={{ color: "#666" }}>Nothing logged for this date.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                minWidth: 650,
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd" }}>
                  <th style={{ width: 40, padding: "6px 8px", textAlign: "left" }}>
                    Qty
                  </th>

                  <th
                    onClick={() => setEatenSort("food")}
                    style={{
                      padding: "6px 8px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: eatenSort === "food" ? 800 : 600
                    }}
                  >
                    {sortLabel("food", "Food")}
                  </th>

                  <th
                    onClick={() => setEatenSort("satFat")}
                    style={{
                      width: 90,
                      padding: "6px 8px",
                      textAlign: "right",
                      cursor: "pointer",
                      fontWeight: eatenSort === "satFat" ? 800 : 600
                    }}
                  >
                    {sortLabel("satFat", "Sat Fat")}
                  </th>

                  <th
                    onClick={() => setEatenSort("sodium")}
                    style={{
                      width: 90,
                      padding: "6px 8px",
                      textAlign: "right",
                      cursor: "pointer",
                      fontWeight: eatenSort === "sodium" ? 800 : 600
                    }}
                  >
                    {sortLabel("sodium", "Sodium")}
                  </th>

                  <th
                    onClick={() => setEatenSort("protein")}
                    style={{
                      width: 90,
                      padding: "6px 8px",
                      textAlign: "right",
                      cursor: "pointer",
                      fontWeight: eatenSort === "protein" ? 800 : 600
                    }}
                  >
                    {sortLabel("protein", "Protein")}
                  </th>

                  <th
                    onClick={() => setEatenSort("fiber")}
                    style={{
                      width: 90,
                      padding: "6px 8px",
                      textAlign: "right",
                      cursor: "pointer",
                      fontWeight: eatenSort === "fiber" ? 800 : 600
                    }}
                  >
                    {sortLabel("fiber", "Fiber")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {eatenToday.map((f) => {
                  const qty = Number(f.qty_today);
                  const satFatValue = qty * Number(f.sat_fat_g ?? 0);
                  const sodiumValue = qty * Number(f.sodium_mg ?? 0);
                  const proteinValue = qty * Number(f.protein_g ?? 0);
                  const fiberValue = qty * Number(f.fiber_g ?? 0);

                  return (
                    <tr
                      key={`eaten-${f.list_order}`}
                      style={{ borderBottom: "1px solid #eee" }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                        {qty}
                      </td>

                      <td style={{ padding: "6px 8px" }}>{f.food_name}</td>

                      <td
                        style={{
                          width: 90,
                          textAlign: "right",
                          color:
                            satFatValue >= 4
                              ? "red"
                              : satFatValue >= 2
                              ? "orange"
                              : "#555",
                          fontWeight:
                            satFatValue >= 2 || eatenSort === "satFat" ? 800 : 400
                        }}
                      >
                        {satFatValue.toFixed(1)} g
                      </td>

                      <td
                        style={{
                          width: 90,
                          textAlign: "right",
                          color:
                            sodiumValue >= 400
                              ? "red"
                              : sodiumValue >= 200
                              ? "orange"
                              : "#555",
                          fontWeight:
                            sodiumValue >= 200 || eatenSort === "sodium" ? 800 : 400
                        }}
                      >
                        {Math.round(sodiumValue)} mg
                      </td>

                      <td
                        style={{
                          width: 90,
                          textAlign: "right",
                          color: "#555",
                          fontWeight: eatenSort === "protein" ? 800 : 400
                        }}
                      >
                        {proteinValue.toFixed(0)} g
                      </td>

                      <td
                        style={{
                          width: 90,
                          textAlign: "right",
                          color: "#555",
                          fontWeight: eatenSort === "fiber" ? 800 : 400
                        }}
                      >
                        {fiberValue.toFixed(0)} g
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const homeButtonStyle: React.CSSProperties = {
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
};

const topRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
  marginBottom: 10
};

const dateRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 12,
  flexWrap: "nowrap"
};

const dateInputStyle: React.CSSProperties = {
  width: 128,
  padding: "6px 6px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontWeight: 700,
  fontSize: 14
};

const dateButtonStyle: React.CSSProperties = {
  padding: "6px 7px",
  minWidth: 42,
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f7f7f7",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const cardsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 6,
  marginBottom: 12
};

const compactCardStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "#fafafa"
};

const costCardStyle: React.CSSProperties = {
  ...compactCardStyle,
  background: "#fff7f2"
};

const compactMetricRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12
};

const compactNumberStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800
};

const compactTargetStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#555",
  textAlign: "right"
};

const averageGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 4
};

const cardStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "#fafafa"
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 2,
  fontWeight: 700
};

const nutrientHeaderStyle: React.CSSProperties = {
  width: 86,
  textAlign: "right",
  color: "#555",
  padding: "6px 8px",
  whiteSpace: "nowrap"
};

const nutrientCellStyle: React.CSSProperties = {
  width: 86,
  textAlign: "right",
  color: "#555",
  padding: "6px 8px",
  whiteSpace: "nowrap"
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