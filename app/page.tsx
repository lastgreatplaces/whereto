"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// Inline Supabase client (simple, no import-path headaches)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type PlaceRow = {
  id: number;
  place_type: string;
  name: string;
  state: string | null;
  subtype: string | null;
  website: string | null;
  notes: string | null;
  favorite: boolean | null;
  lat: number | null;
  lon: number | null;
};

export default function Home() {
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);

  // keep references so we can clear/rebuild markers when needed
  const birdMarkersRef = useRef<any[]>([]);
  const lastFetchTimerRef = useRef<any>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

    if (!key) {
      console.error("Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local");
      return;
    }

    // Don't load the script twice
    if (document.getElementById("google-maps-script")) return;

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;

    script.onload = () => {
      const google = (window as any).google;

      const map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 35.8, lng: -78.6 },
        zoom: 7,
      });

      mapRef.current = map;

      // Byways styling (brown line)
      map.data.setStyle({
        strokeColor: "#5a3e2b",
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });

      // One shared popup for everything we click (byways + markers)
      const infoWindow = new google.maps.InfoWindow();
      infoWindowRef.current = infoWindow;

      // ---- ICON HELPERS (your red-circled emoji style) ----
      const makeCircleIcon = (scale: number) => ({
        path: google.maps.SymbolPath.CIRCLE,
        scale,
        fillColor: "#fafbfb",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#f80808",
      });

      const sizeForZoom = (z: number) => {
        const scale = z <= 7 ? 10 : z <= 9 ? 12 : z <= 11 ? 15 : 18;
        const fontSize = z <= 7 ? "14px" : z <= 9 ? "16px" : z <= 11 ? "18px" : "22px";
        return { scale, fontSize };
      };

      const applyMarkerSizing = () => {
        const z = map.getZoom() ?? 7;
        const { scale, fontSize } = sizeForZoom(z);

        // resize all bird markers we created from DB
        for (const m of birdMarkersRef.current) {
          // each marker stores its emoji in a custom property we set
          const emoji = (m as any).__emoji ?? "🦅";
          m.setIcon(makeCircleIcon(scale));
          m.setLabel({ text: emoji, fontSize });
        }

        // also resize demo markers if you keep them
        if (demoBirdMarker) {
          demoBirdMarker.setIcon(makeCircleIcon(scale));
          demoBirdMarker.setLabel({ text: "🦅", fontSize });
        }
        if (demoHikeMarker) {
          demoHikeMarker.setIcon(makeCircleIcon(scale));
          demoHikeMarker.setLabel({ text: "🚶", fontSize });
        }
      };

      // ---- CLICK POPUP FOR BYWAYS (click a line) ----
      map.data.addListener("click", (event: any) => {
        const name = event.feature.getProperty("name") || "(No name)";
        const designats = event.feature.getProperty("designats") || "";

        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 260px;">
            <div style="font-weight: 700; margin-bottom: 4px;">${name}</div>
            <div>${designats}</div>
          </div>
        `;

        infoWindow.setContent(html);
        infoWindow.setPosition(event.latLng);
        infoWindow.open(map);
      });

      // ---- DEMO markers (optional; safe to delete later) ----
      const demoBirdMarker = new google.maps.Marker({
        position: { lat: 35.9, lng: -78.8 },
        map,
        title: "Demo Birding Spot",
      });
      (demoBirdMarker as any).__emoji = "🦅";

      const demoHikeMarker = new google.maps.Marker({
        position: { lat: 35.6, lng: -78.4 },
        map,
        title: "Demo Hike Spot",
      });
      (demoHikeMarker as any).__emoji = "🚶";

      // ---- LOAD BYWAYS from Supabase based on map bounds (fast + scalable) ----
      const clearByways = () => {
        map.data.forEach((f: any) => map.data.remove(f));
      };

      const loadBywaysInView = async () => {
        const bounds = map.getBounds();
        if (!bounds) return;

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        const min_lng = sw.lng();
        const min_lat = sw.lat();
        const max_lng = ne.lng();
        const max_lat = ne.lat();

        const states = ["NC", "VA", "WV"]; // MVP constraint

        const { data, error } = await supabase.rpc("rpc_byways_in_bbox", {
          min_lng,
          min_lat,
          max_lng,
          max_lat,
          states,
        });

        if (error) {
          console.error("Byways RPC error:", error);
          return;
        }

        const fc = {
          type: "FeatureCollection",
          features: (data || [])
            .filter((r: any) => r.geom_geojson)
            .map((r: any) => ({
              type: "Feature",
              geometry: r.geom_geojson,
              properties: {
                byway_id: r.byway_id,
                name: r.name,
                designats: r.designats,
                state: r.state,
                source: r.source,
              },
            })),
        };

        clearByways();
        map.data.addGeoJson(fc as any);
      };

      const scheduleBywaysLoad = () => {
        if (lastFetchTimerRef.current) clearTimeout(lastFetchTimerRef.current);
        lastFetchTimerRef.current = setTimeout(() => {
          loadBywaysInView();
        }, 250);
      };

      // ---- LOAD BIRDS from places table (once at startup) ----
      const clearBirdMarkers = () => {
        for (const m of birdMarkersRef.current) m.setMap(null);
        birdMarkersRef.current = [];
      };

      const loadBirds = async () => {
        // fetch birds only (you said place_type is "birds")
        const { data, error } = await supabase
          .from("places")
          .select("id, place_type, name, state, subtype, website, notes, favorite, lat, lon")
          .eq("place_type", "birds");

        if (error) {
          console.error("Places query error:", error);
          return;
        }

        // console.log("birds rows:", (data || []).length);

        clearBirdMarkers();

        const rows = (data || []) as PlaceRow[];

        for (const r of rows) {
          if (r.lat == null || r.lon == null) continue;

          const marker = new google.maps.Marker({
            position: { lat: r.lat, lng: r.lon },
            map,
            title: r.name,
          });

          // store emoji for resizing
          (marker as any).__emoji = "🦅";

          // click popup for bird marker
          marker.addListener("click", () => {
            const websiteHtml = r.website
              ? `<div style="margin-top:6px;"><a href="${r.website}" target="_blank" rel="noreferrer">Website</a></div>`
              : "";

            const html = `
              <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 260px;">
                <div style="font-weight: 700; margin-bottom: 4px;">${r.name}</div>
                <div>${r.state ?? ""}${r.subtype ? " • " + r.subtype : ""}</div>
                ${websiteHtml}
              </div>
            `;

            infoWindow.setContent(html);
            infoWindow.setPosition(marker.getPosition()!);
            infoWindow.open(map);
          });

          birdMarkersRef.current.push(marker);
        }

        // apply current zoom sizing to new markers
        applyMarkerSizing();
      };

      // ---- Wire up events ----
      applyMarkerSizing();
      map.addListener("zoom_changed", applyMarkerSizing);

      // byways: update whenever map settles
      map.addListener("idle", scheduleBywaysLoad);

      // initial loads
      loadBirds();        // birds once
      scheduleBywaysLoad(); // byways now
    };

    script.onerror = () => {
      console.error("Failed to load Google Maps script");
    };

    document.head.appendChild(script);
  }, []);

  return (
    <div>
      <h1 style={{ padding: 10 }}>whereto MVP</h1>
      <div id="map" style={{ height: "80vh", width: "100%" }} />
    </div>
  );
}