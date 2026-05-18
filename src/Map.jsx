import { MapContainer, TileLayer, GeoJSON, useMap, Marker } from "react-leaflet";
import indiaData from "./india.json";
import { useState, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// 🔗 Backend URL — set VITE_API_URL in Vercel env vars for production
const API_BASE = import.meta.env.VITE_API_URL || "${API_BASE}";

/* ---------------- DATA & CONSTANTS ---------------- */
const stateData = {
  "andaman and nicobar": 720,
  maharashtra: 500,
  karnataka: 300,
  delhi: 720,
};

/* ---------------- HELPERS ---------------- */
function getColor(co2) {
  // Red (Severe): > 250 (Matches PM2.5 > 90 ug/m3)
  if (co2 > 250) return "red";
  // Yellow (Moderate): > 150 (Matches PM2.5 > 50 ug/m3)
  if (co2 > 150) return "yellow";
  // Green (Good): < 150
  return "green";
}

function style(feature) {
  const stateName = feature.properties.NAME_1.toLowerCase();
  const co2 = stateData[stateName] ?? 300;
  return {
    fillColor: getColor(co2),
    weight: 1,
    color: "black",
    fillOpacity: 0.7,
  };
}

function createTriangleIcon(co2) {
  let color = "green";
  if (co2 > 250) color = "red";
  else if (co2 > 150) color = "yellow";

  return L.divIcon({
    className: "",
    html: `<div style="width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 20px solid ${color}; filter: drop-shadow(0 0 2px black);"></div>`,
    iconSize: [20, 20],
  });
}


function getTreeCapacity(type) {
  if (type === "metro") return 50000;
  if (type === "urban") return 100000;
  return 500000;
}

/* ---------------- AI TEXT HIGHLIGHTER ---------------- */
function highlightText(text) {
  if (!text) return "";

  // Order matters — most specific patterns first
  let result = text
    // CPCB severity keywords
    .replace(/\b(SEVERE|HAZARDOUS)\b/g,
      '<span style="background:#ef444430;color:#f87171;padding:1px 5px;border-radius:3px;font-weight:800;font-size:11px;">$1</span>')
    .replace(/\b(VERY POOR|POOR)\b/g,
      '<span style="background:#f9731630;color:#fb923c;padding:1px 5px;border-radius:3px;font-weight:800;font-size:11px;">$1</span>')
    .replace(/\b(MODERATE)\b/g,
      '<span style="background:#eab30830;color:#fbbf24;padding:1px 5px;border-radius:3px;font-weight:800;font-size:11px;">$1</span>')
    .replace(/\b(SATISFACTORY|GOOD)\b/g,
      '<span style="background:#22c55e30;color:#4ade80;padding:1px 5px;border-radius:3px;font-weight:800;font-size:11px;">$1</span>')
    // Ratios like 3.2x, 5.9x
    .replace(/(\d+\.?\d*x)/g,
      '<span style="color:#fbbf24;font-weight:800;">$1</span>')
    // Percentages like 18.2%, 40%
    .replace(/(\d+\.?\d*%)/g,
      '<span style="color:#34d399;font-weight:700;">$1</span>')
    // Numbers with units like 89 µg/m³, 412 ppm, 12 km/h, 34°C
    .replace(/(\d+\.?\d*\s*(?:µg\/m³|ppm|km\/h|°C|units|µg|mg))/g,
      '<span style="color:#60a5fa;font-weight:700;">$1</span>');

  return result;
}

/* ---------------- LOGIC ---------------- */
function calculateInterventionCO2(baseCO2, trees, ev, industry, renewable, windSpeed, temperature, traffic, industryType) {
  // 1. Calculate how interventions impact the base score
  const treeReduction = (Math.log(1 + trees) / Math.log(1 + 10000)) * 0.15 * baseCO2;
  const evReduction = (ev / 100) * 0.20 * baseCO2;
  const renewableReduction = (renewable / 100) * 0.30 * baseCO2;
  const trafficIncrease = (traffic / 100) * (1 - (ev / 100)) * 0.25 * baseCO2;

  const industryWeights = { small: 0.10, medium: 0.25, heavy: 0.45 };
  const industryIncrease = industry * industryWeights[industryType] * baseCO2;

  // 2. Apply Environmental Multipliers
  let tempMultiplier = 1 + ((temperature - 25) / 100);
  let windMultiplier = Math.max(0.5, 1 - (windSpeed / 50));

  // 3. Final Simulation Math
  let pureEmissions = baseCO2 + trafficIncrease + industryIncrease - treeReduction - evReduction - renewableReduction;
  let finalSimulatedCO2 = pureEmissions * tempMultiplier * windMultiplier;

  return Math.round(Math.max(50, finalSimulatedCO2));
}

function ZoomToState({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds);
  }, [bounds, map]);
  return null;
}

/* ---------------- MAIN COMPONENT ---------------- */
export default function Map() {
  const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

  const [selectedBounds, setSelectedBounds] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [regions, setRegions] = useState([]);

  // Sliders
  // Sliders (Empty Canvas Defaults)
  const [trees, setTrees] = useState(0);
  const [ev, setEv] = useState(0);
  const [industry, setIndustry] = useState(0);
  const [renewable, setRenewable] = useState(0);
  const [windSpeed, setWindSpeed] = useState(10);
  const [temperature, setTemperature] = useState(30);
  const [traffic, setTraffic] = useState(0);
  const [industryType, setIndustryType] = useState("medium");
  const [baseCO2, setBaseCO2] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showBorders, setShowBorders] = useState(false);

  // Autocomplete States
  const [suggestions, setSuggestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // New Simulation States
  const [finalSimulatedCO2, setFinalSimulatedCO2] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // AI States — Phase 1: Analyst
  const [aiInsights, setAiInsights] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState(false);

  // AI States — Phase 2: Optimizer
  const [simulationExecuted, setSimulationExecuted] = useState(false);
  const [optimizerTarget, setOptimizerTarget] = useState(20);
  const [optimizerPrediction, setOptimizerPrediction] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [optimizerError, setOptimizerError] = useState(null);

  // Welcome Overlay State
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    // Lazy load the heavy GeoJSON borders to prevent initial page freeze
    const timer = setTimeout(() => setShowBorders(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Debounced Autocomplete
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsTyping(true);
      try {
        const res = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSuggestions(data);
        setShowDropdown(true);
      } catch (err) {
        console.error("Autocomplete error:", err);
      } finally {
        setIsTyping(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSuggestion = async (suggestion) => {
    setSearchQuery(suggestion.name);
    setShowDropdown(false);
    setIsLoading(true);

    try {
      // Directly fetch AQ because we already have the coordinates!
      const res = await fetch(`${API_BASE}/aq?lat=${suggestion.lat}&lon=${suggestion.lon}`);
      const aqData = await res.json();

      let co2 = 300;
      if (aqData && (aqData.pm25 || aqData.no2)) {
        co2 = Math.round(aqData.pm25 * 2 + aqData.no2 * 1.5 + aqData.so2 * 1.2 + aqData.o3);
      }

      const newPoint = {
        lat: suggestion.lat,
        lng: suggestion.lon,
        name: suggestion.name,
        co2,
        type: aqData.type || "rural",
        raw: aqData
      };

      // Reset UI on new search
      setFinalSimulatedCO2(null);
      setRegions([newPoint]);
      setSelectedBounds([[suggestion.lat - 0.5, suggestion.lon - 0.5], [suggestion.lat + 0.5, suggestion.lon + 0.5]]);
    } catch (err) {
      console.error("Simulation error:", err);
      alert("Error fetching simulation data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    setShowDropdown(false);
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || "Location not found!");
        setIsLoading(false);
        return;
      }

      let co2 = 300;
      if (data && (data.pm25 || data.no2)) {
        co2 = Math.round(data.pm25 * 2 + data.no2 * 1.5 + data.so2 * 1.2 + data.o3);
      }

      const newPoint = {
        lat: data.lat,
        lng: data.lon,
        name: data.name,
        co2,
        type: data.type || "rural",
        raw: data
      };

      // Reset UI on new search
      setFinalSimulatedCO2(null);
      setRegions([newPoint]);
      setSelectedBounds([[data.lat - 0.5, data.lon - 0.5], [data.lat + 0.5, data.lon + 0.5]]);
    } catch (err) {
      console.error("Search error:", err);
      alert("Error searching location");
    } finally {
      setIsLoading(false);
    }
  };

  // Unified Click Handler
  const handleMarkerClick = async (point) => {

    //log 1
    console.log(`--- Fetching data for: ${point.name} ---`);
    console.log(`Coordinates: Lat ${point.lat}, Lng ${point.lng}`);

    try {
      // Fetch Weather
      const wRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${point.lat}&lon=${point.lng}&appid=${API_KEY}`);
      const wData = await wRes.json();

      //log 2
      console.log("Weather API Response:", wData);


      if (wData.main) {
        setTemperature(Math.round(wData.main.temp - 273.15));
        setWindSpeed(wData.wind.speed);
      }

      // Fetch AQ
      const aqRes = await fetch(`${API_BASE}/aq?lat=${point.lat}&lon=${point.lng}`);
      const aqData = await aqRes.json();

      // LOG 3: Verify Air Quality API response
      console.log("AQ API Response:", aqData);


      if (aqData) {
        const calcBase = Math.round(aqData.pm25 * 2 + aqData.no2 * 1.5 + aqData.so2 * 1.2 + aqData.o3);

        // LOG 4: Verify the final calculated Base CO2
        console.log(`Calculated Base CO2 for ${point.name}:`, calcBase);

        setBaseCO2(calcBase);
        setSelectedRegion({ ...point, type: aqData.type || point.type });
        setFinalSimulatedCO2(null);
      } else {
        setBaseCO2(point.co2);
        setSelectedRegion(point);
        setFinalSimulatedCO2(null);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setBaseCO2(point.co2);
      setSelectedRegion(point);
      setFinalSimulatedCO2(null);
    }
  };

    useEffect(() => {
      if (selectedRegion) {
        setTrees(0);
        setEv(0);
        setIndustry(0);
        setRenewable(0);
        setTraffic(0);
        setFinalSimulatedCO2(null);
        setAiInsights(null);
        setOptimizerPrediction(null);
        setOptimizerError(null);
        setSimulationExecuted(false);
        setAiError(false);
      }
    }, [selectedRegion?.name]);

    const handleRunSimulation = async () => {
      setIsSimulating(true);
      setFinalSimulatedCO2(null);
      setAiInsights(null);
      setAiError(false);

      // Simulate computation delay for dramatic effect
      await new Promise(resolve => setTimeout(resolve, 1500));

      const base = baseCO2 || selectedRegion.co2;
      const result = calculateInterventionCO2(
        base, trees, ev, industry, renewable, windSpeed, temperature, traffic, industryType
      );
      setFinalSimulatedCO2(result);
      setIsSimulating(false);
      setSimulationExecuted(true);
      setOptimizerPrediction(null);
      setOptimizerError(null);

      // Phase 1: Fetch AI Insights automatically after simulation
      setIsLoadingAI(true);
      try {
        const delta = result - base;
        const pct = ((delta / base) * 100).toFixed(1);
        const raw = selectedRegion.raw || {};

        const aiRes = await fetch("${API_BASE}/ai-insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: selectedRegion.name.split(',').slice(0, 2).join(','),
            type: selectedRegion.type,
            originalCO2: base,
            simulatedCO2: result,
            percentChange: pct,
            trees, ev, renewable, traffic, industry, industryType,
            windSpeed, temperature,
            pm25: raw.pm25 || 0,
            no2: raw.no2 || 0,
            so2: raw.so2 || 0,
            o3: raw.o3 || 0
          })
        });
        const aiData = await aiRes.json();
        if (!aiData.error) setAiInsights(aiData);
        else setAiError(true);
      } catch (err) {
        console.error("AI insights error:", err);
        setAiError(true);
      } finally {
        setIsLoadingAI(false);
      }
    };

    // Phase 2: Preview optimal sliders (inverse formula on backend)
    const handleOptimizerPreview = async (pct) => {
      setOptimizerTarget(pct);
      if (!finalSimulatedCO2 || !selectedRegion) return;
      setIsPreviewing(true);
      setOptimizerPrediction(null);
      setOptimizerError(null);
      try {
        const res = await fetch("${API_BASE}/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            simulatedCO2: finalSimulatedCO2,
            baseCO2: baseCO2 || selectedRegion.co2,
            targetPct: pct,
            windSpeed, temperature,
            maxTrees: getTreeCapacity(selectedRegion.type),
            city: selectedRegion.name.split(',').slice(0, 2).join(','),
            type: selectedRegion.type,
            currentTrees: trees, currentEv: ev,
            currentRenewable: renewable, currentTraffic: traffic,
            currentIndustry: industry, currentIndustryType: industryType
          })
        });
        const data = await res.json();
        if (!data.error) setOptimizerPrediction(data);
        else setOptimizerError(data.error);
      } catch (err) {
        console.error("Preview error:", err);
        setOptimizerError("Could not reach server. Is the backend running?");
      } finally {
        setIsPreviewing(false);
      }
    };

    // Apply optimizer prediction values to sliders
    const handleApplyToSliders = () => {
      if (!optimizerPrediction) return;
      setTrees(optimizerPrediction.trees);
      setEv(optimizerPrediction.ev);
      setRenewable(optimizerPrediction.renewable);
      setTraffic(optimizerPrediction.traffic);
      setIndustry(optimizerPrediction.industry);
      setIndustryType(optimizerPrediction.industryType);
    };

    // Regenerate AI insights with current simulation data
    const handleRegenerate = async () => {
      if (!finalSimulatedCO2 || !selectedRegion) return;
      setAiInsights(null);
      setAiError(false);
      setIsLoadingAI(true);
      try {
        const base = baseCO2 || selectedRegion.co2;
        const delta = finalSimulatedCO2 - base;
        const pct = ((delta / base) * 100).toFixed(1);
        const raw = selectedRegion.raw || {};
        const aiRes = await fetch("${API_BASE}/ai-insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: selectedRegion.name.split(',').slice(0, 2).join(','),
            type: selectedRegion.type,
            originalCO2: base,
            simulatedCO2: finalSimulatedCO2,
            percentChange: pct,
            trees, ev, renewable, traffic, industry, industryType,
            windSpeed, temperature,
            pm25: raw.pm25 || 0, no2: raw.no2 || 0,
            so2: raw.so2 || 0, o3: raw.o3 || 0
          })
        });
        const aiData = await aiRes.json();
        if (!aiData.error) setAiInsights(aiData);
        else setAiError(true);
      } catch {
        setAiError(true);
      } finally {
        setIsLoadingAI(false);
      }
    };

    return (
      <div style={{ height: "100vh", width: "100%", fontFamily: "sans-serif", position: "relative" }}>
        {/* Welcome Overlay */}
        {showWelcome && (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, background: "rgba(253, 252, 249, 0.6)", backdropFilter: "blur(10px)", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div className="glass-card" style={{ padding: "40px", borderRadius: "4px", border: "2px solid #1c1917", maxWidth: "600px", textAlign: "center", animation: "fadeIn 0.5s ease-out" }}>
              <h1 style={{ fontSize: "28px", color: "#1c1917", margin: "0 0 15px 0", fontWeight: "800", letterSpacing: "1px" }}>ENVIRONMENTAL DIGITAL TWIN :: V1.4</h1>
              <p style={{ fontSize: "16px", color: "#57534e", lineHeight: "1.6", margin: "0 0 30px 0" }}>
                System loaded. Select a geographical region or input coordinates to begin spatial analysis. Real-time environmental metrics and massive intervention simulation active.
              </p>
              <button 
                onClick={() => setShowWelcome(false)}
                style={{ padding: "16px 32px", fontSize: "16px", fontWeight: "bold", color: "white", background: "#1c1917", border: "none", borderRadius: "4px", cursor: "pointer", letterSpacing: "2px", transition: "background 0.2s" }}
                onMouseEnter={(e) => e.target.style.background = "#44403c"}
                onMouseLeave={(e) => e.target.style.background = "#1c1917"}
              >
                [ INITIALIZE WORKSPACE ]
              </button>
            </div>
          </div>
        )}

        {/* Search Bar Overlay */}
        <div style={{ position: "absolute", top: "20px", left: "60px", zIndex: 1000, display: "flex", flexDirection: "column", gap: "5px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              placeholder="Search any town in India..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setShowDropdown(false); handleSearch(e); } }}
              style={{ padding: "10px", borderRadius: "4px", border: "1px solid #d6d3d1", width: "300px", outline: "none", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", background: "#ffffff", color: "#1c1917" }}
            />
            <button
              onClick={(e) => { setShowDropdown(false); handleSearch(e); }}
              disabled={isLoading}
              style={{ padding: "10px 20px", background: isLoading ? "#78716c" : "#1c1917", color: "white", borderRadius: "4px", cursor: isLoading ? "not-allowed" : "pointer", border: "none", letterSpacing: "1px", textTransform: "uppercase", fontSize: "12px", fontWeight: "bold", transition: "all 0.3s", width: "150px" }}
            >
              {isLoading ? "CALCULATING..." : "SEARCH"}
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", background: "white", borderRadius: "8px", boxShadow: "0 4px 10px rgba(0,0,0,0.1)", maxHeight: "250px", overflowY: "auto", width: "300px" }}>
              {suggestions.map((s, i) => (
                <li
                  key={i}
                  onClick={() => handleSelectSuggestion(s)}
                  style={{ padding: "12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: "14px", color: "#374151" }}
                  onMouseEnter={(e) => e.target.style.background = "#f9fafb"}
                  onMouseLeave={(e) => e.target.style.background = "white"}
                >
                  <span style={{ fontWeight: "bold" }}>{s.name.split(',')[0]}</span>
                  <span style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginTop: "2px" }}>{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!selectedRegion ? (
          <MapContainer center={[22.9734, 78.6569]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {/* Real Satellite Imagery */}
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            {/* City Names & Boundaries Overlay */}
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
            {showBorders && <GeoJSON
              data={indiaData}
              style={style}
              onEachFeature={(feature, layer) => {
                layer.on("click", () => {
                  setSelectedBounds(layer.getBounds());
                });
              }}
            />}
            <ZoomToState bounds={selectedBounds} />
            {regions.map((point, i) => (
              <Marker
                key={i}
                position={[point.lat, point.lng]}
                icon={createTriangleIcon(point.co2)}
                eventHandlers={{
                  click: () => handleMarkerClick(point)
                }}
              />
            ))}
          </MapContainer>
        ) : (
          <div style={{ display: "flex", height: "100%" }}>
            <div style={{ width: "50%" }}>
              <MapContainer center={[22.9734, 78.6569]} zoom={5} style={{ height: "100%", width: "100%" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {showBorders && <GeoJSON data={indiaData} style={style} />}
                <ZoomToState bounds={selectedBounds} />
                {regions.map((point, i) => (
                  <Marker
                    key={i}
                    position={[point.lat, point.lng]}
                    icon={createTriangleIcon(point.co2)}
                    eventHandlers={{
                      click: () => handleMarkerClick(point)
                    }}
                  />
                ))}
              </MapContainer>
            </div>

            <div className="glass-panel" style={{ width: "50%", padding: "30px", overflow: "auto" }}>
              {/* Header Card */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: "28px", color: "#1c1917", fontWeight: "800", textTransform: "uppercase" }}>
                    {selectedRegion.name.split(',').slice(0, 2).join(',')}
                  </h1>
                  <div style={{ marginTop: "8px" }}>
                    <span style={{ background: "#3b82f6", color: "white", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>
                      {selectedRegion.type}
                    </span>
                  </div>
                </div>
              </div>

              {/* Layout grid for Map and Constants */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
                {/* Minimap */}
                <div style={{ borderRadius: "4px", overflow: "hidden", border: "1px solid #e7e5e4", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
                  <MapContainer key={`${selectedRegion.lat}-${selectedRegion.lng}`} center={[selectedRegion.lat, selectedRegion.lng]} zoom={11} style={{ height: "100%", minHeight: "140px", width: "100%", flex: 1 }} zoomControl={false}>
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
                    <Marker position={[selectedRegion.lat, selectedRegion.lng]} icon={createTriangleIcon(finalSimulatedCO2 || selectedRegion.co2)} />
                  </MapContainer>
                </div>

                {/* Environmental Constants Card */}
                <div className="glass-card-dark" style={{ borderRadius: "4px", padding: "15px", color: "white", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <h3 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px" }}>LIVE ENVIRONMENT METRICS</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>
                        WIND SPEED
                      </span>
                      <span style={{ color: "#60a5fa", fontWeight: "bold" }}>{windSpeed} km/h</span>
                    </label>
                    <input type="range" min="0" max="50" value={windSpeed} onChange={e => setWindSpeed(Number(e.target.value))} style={{ accentColor: "#60a5fa" }} />
                    
                    <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
                        TEMPERATURE
                      </span>
                      <span style={{ color: "#f87171", fontWeight: "bold" }}>{temperature}°C</span>
                    </label>
                    <input type="range" min="10" max="50" value={temperature} onChange={e => setTemperature(Number(e.target.value))} style={{ accentColor: "#f87171" }} />
                  </div>
                </div>
              </div>

              {/* Human Interventions Card */}
              <div className="glass-card" style={{ borderRadius: "4px", padding: "20px", marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 15px 0", color: "#1c1917", fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px", borderBottom: "2px solid #f5f5f4", paddingBottom: "10px" }}>INTERVENTION PARAMETERS</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={{ fontSize: "12px", textTransform: "uppercase", color: "#57534e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 14 4-8 4 8"/><path d="m7 18 5-9 5 9"/><path d="M12 18v4"/></svg> TREE PLANTING</span> <b style={{ color: "#1c1917" }}>{trees.toLocaleString()}</b>
                    </label>
                    <input type="range" min="0" max={getTreeCapacity(selectedRegion.type)} value={trees} onChange={e => setTrees(Number(e.target.value))} style={{ accentColor: "#10b981" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={{ fontSize: "12px", textTransform: "uppercase", color: "#57534e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg> EV ADOPTION</span> <b style={{ color: "#1c1917" }}>{ev}%</b>
                    </label>
                    <input type="range" min="0" max="100" value={ev} onChange={e => setEv(Number(e.target.value))} style={{ accentColor: "#10b981" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={{ fontSize: "12px", textTransform: "uppercase", color: "#57534e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> RENEWABLE ENERGY</span> <b style={{ color: "#1c1917" }}>{renewable}%</b>
                    </label>
                    <input type="range" min="0" max="100" value={renewable} onChange={e => setRenewable(Number(e.target.value))} style={{ accentColor: "#10b981" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={{ fontSize: "12px", textTransform: "uppercase", color: "#57534e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> TRAFFIC DENSITY</span> <b style={{ color: "#1c1917" }}>+{traffic}%</b>
                    </label>
                    <input type="range" min="0" max="100" value={traffic} onChange={e => setTraffic(Number(e.target.value))} style={{ accentColor: "#ef4444" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", gridColumn: "span 2" }}>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
                        <label style={{ fontSize: "12px", textTransform: "uppercase", color: "#57534e", display: "flex", alignItems: "center", gap: "6px" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></svg> NEW FACTORIES
                        </label>
                        <select value={industry} onChange={e => setIndustry(Number(e.target.value))} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d6d3d1", background: "#ffffff", color: "#1c1917", accentColor: "#ef4444" }}>
                          <option value={0}>None</option><option value={1}>1 Plant</option><option value={2}>2 Plants</option><option value={3}>3 Plants</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
                        <label style={{ fontSize: "12px", textTransform: "uppercase", color: "#57534e" }}>FACTORY SIZE</label>
                        <select value={industryType} onChange={e => setIndustryType(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d6d3d1", background: "#ffffff", color: "#1c1917" }}>
                          <option value="small">Small Capacity</option><option value="medium">Medium Capacity</option><option value="heavy">Heavy Industrial</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Optimizer Section */}
                <div style={{ marginTop: "16px", borderTop: "2px solid #f5f5f4", paddingTop: "16px", opacity: simulationExecuted ? 1 : 0.45, pointerEvents: simulationExecuted ? "auto" : "none", transition: "opacity 0.3s" }}>

                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#57534e", letterSpacing: "1px", fontWeight: "800", display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12m11.32-11.32 2.12-2.12"/></svg>
                      AI OPTIMIZER
                    </span>
                    <span style={{ fontSize: "10px", color: simulationExecuted ? "#7c3aed" : "#9ca3af", fontWeight: "600" }}>
                      {simulationExecuted ? `Based on simulation: ${finalSimulatedCO2}` : "Run simulation to unlock"}
                    </span>
                  </div>

                  {/* Target % Buttons */}
                  <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                    {[10, 20, 30, 40].map(pct => (
                      <button
                        key={pct}
                        onClick={() => handleOptimizerPreview(pct)}
                        style={{ flex: 1, padding: "6px 0", borderRadius: "4px", border: `1px solid ${optimizerTarget === pct && optimizerPrediction ? "#7c3aed" : "#d6d3d1"}`, background: optimizerTarget === pct && optimizerPrediction ? "#7c3aed" : "transparent", color: optimizerTarget === pct && optimizerPrediction ? "white" : "#57534e", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "all 0.15s" }}
                      >
                        {isPreviewing && optimizerTarget === pct ? "..." : `${pct}%`}
                      </button>
                    ))}
                  </div>

                  {/* Prediction Panel / Error */}
                  {optimizerError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px", padding: "10px", marginBottom: "10px", fontSize: "12px", color: "#dc2626" }}>
                      ⚠️ {optimizerError}
                    </div>
                  )}
                  {optimizerPrediction && (
                    <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "4px", padding: "12px", marginBottom: "10px" }}>

                      {/* Headline */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "800", color: "#5b21b6" }}>
                          🎯 Predicts: ~{optimizerPrediction.predictedCO2}
                        </span>
                        <span style={{ fontSize: "11px", color: optimizerPrediction.achievable ? "#059669" : "#d97706", fontWeight: "700", background: optimizerPrediction.achievable ? "#d1fae5" : "#fef3c7", padding: "2px 8px", borderRadius: "10px" }}>
                          {optimizerPrediction.achievable ? `−${optimizerPrediction.achievedPct}%` : `⚠️ Max: −${optimizerPrediction.achievedPct}%`}
                        </span>
                      </div>

                      {/* Parameter Deltas — only show changed ones */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px" }}>
                        {[
                          { label: "Renewable", from: renewable, to: optimizerPrediction.renewable, unit: "%" },
                          { label: "EV Adoption", from: ev, to: optimizerPrediction.ev, unit: "%" },
                          { label: "Trees", from: trees, to: optimizerPrediction.trees, unit: "" }
                        ].filter(d => d.from !== d.to).map(({ label, from, to, unit }) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#4c1d95" }}>
                            <span>{label}</span>
                            <span style={{ fontWeight: "700" }}>
                              {typeof from === 'number' && from > 999 ? from.toLocaleString() : from}{unit}
                              <span style={{ color: "#7c3aed", margin: "0 4px" }}>→</span>
                              <span style={{ color: "#5b21b6" }}>{typeof to === 'number' && to > 999 ? to.toLocaleString() : to}{unit}</span>
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Reasoning */}
                      {optimizerPrediction.reasoning && (
                        <div style={{ fontSize: "11px", color: "#6d28d9", borderTop: "1px solid #ddd6fe", paddingTop: "8px", lineHeight: "1.5", fontStyle: "italic" }}>
                          💡 {optimizerPrediction.reasoning}
                        </div>
                      )}

                      {/* Apply Button */}
                      <button
                        onClick={handleApplyToSliders}
                        style={{ width: "100%", marginTop: "10px", padding: "8px", background: "#7c3aed", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: "800", letterSpacing: "1.5px", cursor: "pointer", textTransform: "uppercase", transition: "background 0.15s" }}
                        onMouseEnter={e => e.target.style.background = "#6d28d9"}
                        onMouseLeave={e => e.target.style.background = "#7c3aed"}
                      >[ APPLY TO SLIDERS ]</button>
                    </div>
                  )}

                </div>
              </div>

              {/* Simulation Button */}
              <button 
                onClick={handleRunSimulation} 
                disabled={isSimulating}
                style={{ width: "100%", padding: "18px", background: isSimulating ? "#064e3b" : "#047857", color: "white", border: "none", borderRadius: "4px", fontSize: "16px", letterSpacing: "2px", fontWeight: "bold", cursor: isSimulating ? "not-allowed" : "pointer", transition: "all 0.2s", marginBottom: "20px", textTransform: "uppercase" }}
              >
                {isSimulating ? "CALCULATING DELTA..." : "[ EXECUTE SIMULATION ]"}
              </button>

              {/* Score Readout Card */}
              {(() => {
                const base = selectedRegion.co2;
                const sim = finalSimulatedCO2;
                const delta = sim !== null ? sim - base : null;
                const pct = sim !== null ? ((delta / base) * 100).toFixed(1) : null;
                const isImprovement = delta !== null && delta < 0;
                const isSame = delta === 0;
                const changeColor = isSame ? "#9ca3af" : isImprovement ? "#34d399" : "#f87171";
                const arrow = isSame ? "→" : isImprovement ? "↓" : "↑";

                return (
                  <div className="glass-card-dark" style={{ borderRadius: "4px", padding: "25px", color: "white", marginBottom: "20px" }}>
                    {/* Top row: Original | Simulated */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
                      {/* Original */}
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>ORIGINAL</span>
                        <span style={{ fontSize: "34px", fontWeight: "900", color: "#e5e7eb" }}>{base}</span>
                        <span style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>ppm equivalent</span>
                      </div>

                      {/* Divider */}
                      <div style={{ height: "50px", width: "1px", background: "#4b5563" }}></div>

                      {/* Simulated */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>SIMULATED</span>
                        {sim !== null ? (
                          <>
                            <span style={{ fontSize: "34px", fontWeight: "900", color: getColor(sim) }}>{sim}</span>
                            <span style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>ppm equivalent</span>
                          </>
                        ) : (
                          <span style={{ fontSize: "15px", fontStyle: "italic", color: "#9ca3af", marginTop: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>PENDING</span>
                        )}
                      </div>
                    </div>

                    {/* Bottom row: Change pill */}
                    {sim !== null && (
                      <div style={{ borderTop: "1px solid #374151", paddingTop: "14px", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px" }}>NET CHANGE</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: `${changeColor}18`, border: `1px solid ${changeColor}55`, borderRadius: "20px", padding: "5px 14px" }}>
                          <span style={{ fontSize: "18px", fontWeight: "bold", color: changeColor }}>{arrow}</span>
                          <span style={{ fontSize: "15px", fontWeight: "800", color: changeColor }}>{Math.abs(delta)} units</span>
                          <span style={{ fontSize: "13px", color: changeColor, opacity: 0.85 }}>({isImprovement ? "" : "+"}{pct}%)</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* AI Analyst Card — Phase 1 */}
              {(isLoadingAI || aiInsights || aiError) && (
                <div className="glass-card-dark" style={{ borderRadius: "4px", overflow: "hidden", marginBottom: "20px" }}>

                  {/* Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #374151", background: "rgba(167,139,250,0.07)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <span style={{ fontSize: "14px" }}>🤖</span>
                      <span style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "2px", color: "#a78bfa" }}>AI ANALYST</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "10px", color: "#6b7280", background: "#1f2937", padding: "2px 8px", borderRadius: "10px", border: "1px solid #374151", letterSpacing: "0.5px" }}>✦ Gemini</span>
                      {!isLoadingAI && (
                        <button
                          onClick={handleRegenerate}
                          title="Regenerate analysis"
                          style={{ background: "transparent", border: "1px solid #4b5563", color: "#9ca3af", padding: "3px 9px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}
                          onMouseEnter={e => { e.target.style.borderColor = "#a78bfa"; e.target.style.color = "#a78bfa"; }}
                          onMouseLeave={e => { e.target.style.borderColor = "#4b5563"; e.target.style.color = "#9ca3af"; }}
                        >↻</button>
                      )}
                    </div>
                  </div>

                  {/* Loading State — shimmer skeleton */}
                  {isLoadingAI && (
                    <div style={{ padding: "16px" }}>
                      {["100%", "85%", "70%", "90%", "55%"].map((w, i) => (
                        <div key={i} className="skeleton" style={{ height: "12px", width: w, marginBottom: "10px" }} />
                      ))}
                    </div>
                  )}

                  {/* Error State */}
                  {!isLoadingAI && aiError && (
                    <div style={{ padding: "20px", textAlign: "center" }}>
                      <div style={{ fontSize: "13px", color: "#f87171", marginBottom: "12px" }}>⚠️ Analysis failed — Gemini unavailable</div>
                      <button
                        onClick={handleRegenerate}
                        style={{ background: "#374151", border: "1px solid #4b5563", color: "#d1d5db", padding: "6px 16px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", letterSpacing: "1px" }}
                      >RETRY</button>
                    </div>
                  )}

                  {/* Insights — 4 compact sections with left-border accent */}
                  {!isLoadingAI && aiInsights && [
                    { icon: "📍", label: "SITUATION",    key: "situation",      color: "#60a5fa", delay: "0s"    },
                    { icon: "🔍", label: "ROOT CAUSE",   key: "rootCause",      color: "#f87171", delay: "0.05s" },
                    { icon: "✅", label: "YOUR IMPACT",  key: "impact",         color: "#34d399", delay: "0.1s"  },
                    { icon: "💡", label: "ACTION",       key: "recommendation", color: "#fbbf24", delay: "0.15s" }
                  ].map(({ icon, label, key, color, delay }) => (
                    <div
                      key={key}
                      className="ai-section"
                      style={{ padding: "12px 16px", borderBottom: "1px solid #1e2533", borderLeft: `3px solid ${color}`, animationDelay: delay }}
                    >
                      <div style={{ fontSize: "9px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1.5px", color, marginBottom: "5px", opacity: 0.9 }}>
                        {icon} {label}
                      </div>
                      <p
                        style={{ margin: 0, fontSize: "12px", color: "#d1d5db", lineHeight: "1.65", fontWeight: "400" }}
                        dangerouslySetInnerHTML={{ __html: highlightText(aiInsights[key]) }}
                      />
                    </div>
                  ))}

                </div>
              )}

              <button onClick={() => setSelectedRegion(null)} style={{ padding: "12px", width: "100%", background: "transparent", color: "#57534e", border: "1px solid #d6d3d1", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", transition: "all 0.2s", fontSize: "14px" }} onMouseEnter={(e) => { e.target.style.background = "#e7e5e4"; }} onMouseLeave={(e) => { e.target.style.background = "transparent"; }}>[ RETURN TO GLOBAL VIEW ]</button>
            </div>
          </div>
        )}
      </div>
    );
  }
