require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🤖 GEMINI INIT
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 🔁 Retry wrapper — handles 503/429 with exponential backoff
async function geminiWithRetry(prompt, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await geminiModel.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      lastErr = err;
      const is503 = err.message?.includes("503");
      const is429 = err.message?.includes("429");
      if ((is503 || is429) && attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(`⚠️  Gemini ${is503 ? "503" : "429"} — retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

const { fetchPopulation, classifyByPopulation } = require("./utils/getpopulation");

const app = express();

// 🚀 Fix for Render reverse proxy (required for express-rate-limit)
app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || "*"
}));
app.use(express.json());

// 🛡️ RATE LIMITERS
// Global safety net — hard ceiling for all traffic combined
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,                  // 500 requests per IP per 15 min
  standardHeaders: true,     // Return RateLimit headers
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down.", retryAfter: 900 }
});

// /aq — most expensive: hits OpenAQ + OpenWeather + GeoDB
const aqLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 60,                   // 60 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AQ rate limit exceeded. Wait before fetching again.", retryAfter: 60 }
});

// /search — geocoding + full AQ pipeline
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 30,                   // 30 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Search rate limit exceeded. Please wait a moment.", retryAfter: 60 }
});

// /autocomplete — lightweight but fires on every keystroke
const autocompleteLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 120,                  // 120 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Autocomplete rate limit exceeded.", retryAfter: 60 }
});

// Apply global limiter to ALL routes
app.use(globalLimiter);

// 🔥 CACHE SETUP
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function hasValidData(data) {
  return data && (data.pm25 > 0 || data.no2 > 0 || data.so2 > 0 || data.o3 > 0);
}

// 🔹 Fetch OpenAQ
async function fetchOpenAQ(lat, lon) {
  try {
    const locUrl = `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=10000&limit=1`;

    const locRes = await axios.get(locUrl, {
      headers: { "X-API-Key": process.env.OPENAQ_API_KEY },
      timeout: 3000
    });

    const location = locRes.data.results[0];
    if (!location) return null;

    const sensorsUrl = `https://api.openaq.org/v3/locations/${location.id}/sensors`;

    const sensorsRes = await axios.get(sensorsUrl, {
      headers: { "X-API-Key": process.env.OPENAQ_API_KEY },
      timeout: 3000
    });

    let data = { pm25: null, no2: null, so2: null, o3: null, co: null };

    sensorsRes.data.results.forEach((s) => {
      const param = s.parameter.name.toLowerCase();
      const value = s.latest?.value;

      if (!value || value <= 0) return;

      if (param.includes("pm25")) data.pm25 = value;
      if (param.includes("no2")) data.no2 = value;
      if (param.includes("so2")) data.so2 = value;
      if (param.includes("o3")) data.o3 = value;
      if (param.includes("co")) data.co = value;
    });

    return data;

  } catch (err) {
    console.log("⚠️ OpenAQ failed");
    return null;
  }
}

// 🔹 Fetch OpenWeather
async function fetchOpenWeatherAQ(lat, lon) {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}`,
      { timeout: 3000 }
    );

    const c = res.data.list[0].components;

    return {
      pm25: c.pm2_5,
      no2: c.no2,
      so2: c.so2,
      o3: c.o3,
      co: c.co/1000
    };

  } catch (err) {
    console.log("⚠️ OpenWeather failed");
    return null;
  }
}

// 🔹 Fallback generator
function generateFallback(lat, lon) {
  const seed = Math.abs(Math.sin(lat + lon) * 100);

  return {
    pm25: 30 + (seed % 40),
    no2: 20 + (seed % 20),
    so2: 5 + (seed % 10),
    o3: 25 + (seed % 15),
    co: 0.5 + (seed % 5) / 10
  };
}

// 🔹 Core Logic extracted for reuse
async function getAirQualityData(lat, lon) {
  const key = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  console.log("KEY:", key);

  if (cache.has(key)) {
    const { data, timestamp } = cache.get(key);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log("⚡ Cache hit");
      return data;
    } else {
      console.log("♻️ Cache expired");
      cache.delete(key);
    }
  }

  console.log("🌐 Cache miss → fetching APIs");

  const [aqRes, owRes] = await Promise.allSettled([
    fetchOpenAQ(lat, lon),
    fetchOpenWeatherAQ(lat, lon)
  ]);

  const aqData = aqRes.status === "fulfilled" ? aqRes.value : null;
  const owData = owRes.status === "fulfilled" ? owRes.value : null;

  let finalData;

  if (hasValidData(aqData)) {
    console.log("✅ Using OpenAQ");
    finalData = {
      pm25: aqData.pm25 ?? owData?.pm25 ?? 0,
      no2: aqData.no2 ?? owData?.no2 ?? 0,
      so2: aqData.so2 ?? owData?.so2 ?? 0,
      o3: aqData.o3 ?? owData?.o3 ?? 0,
      co: aqData.co ?? owData?.co ?? 0
    };
  } else if (hasValidData(owData)) {
    console.log("⚠️ Using OpenWeather fallback");
    finalData = owData;
  } else {
    console.log("⚠️ Using generated fallback");
    finalData = generateFallback(lat, lon);
  }

  const popData = await fetchPopulation(lat, lon);
  let regionType = "rural";
  if (popData) {
    regionType = classifyByPopulation(popData.population);
  }
  console.log("🏙 Region Type:", regionType);

  const responseData = {
    ...finalData,
    type: regionType
  };

  if (hasValidData(aqData) || hasValidData(owData)) {
    cache.set(key, {
      data: responseData,
      timestamp: Date.now()
    });
  }

  return responseData;
}

// 🟢 KEEP-AWAKE PING ROUTE (For UptimeRobot)
app.get("/ping", (req, res) => {
  res.status(200).send("OK");
});

// 🔥 MAIN ROUTE
app.get("/aq", aqLimiter, async (req, res) => {
  const { lat, lon } = req.query;
  try {
    const data = await getAirQualityData(lat, lon);
    res.json(data);
  } catch (err) {
    console.error("❌ System error:", err.message);
    res.json(generateFallback(lat, lon));
  }
});

// 🔥 SEARCH ROUTE (Reverse Proxy)
const searchCache = new Map();

app.get("/search", searchLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query parameter" });

  const searchKey = q.toLowerCase().trim();

  if (searchCache.has(searchKey)) {
    const { data, timestamp } = searchCache.get(searchKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`⚡ Search Cache hit for "${searchKey}"`);
      return res.json(data);
    }
    searchCache.delete(searchKey);
  }

  try {
    console.log(`🌐 Geocoding "${q}"...`);
    const geoRes = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=IN&format=json&limit=1`,
      { headers: { "User-Agent": "co2-digital-twin/1.0" } }
    );

    if (!geoRes.data || geoRes.data.length === 0) {
      return res.status(404).json({ error: "Location not found in India" });
    }

    const lat = geoRes.data[0].lat;
    const lon = geoRes.data[0].lon;
    const name = geoRes.data[0].name || q;

    const aqData = await getAirQualityData(lat, lon);

    const responsePayload = {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      name,
      ...aqData
    };

    searchCache.set(searchKey, { data: responsePayload, timestamp: Date.now() });
    res.json(responsePayload);

  } catch (err) {
    console.error("❌ Search error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// 🔥 AUTOCOMPLETE ROUTE (Fast Geocoding)
const autocompleteCache = new Map();

app.get("/autocomplete", autocompleteLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const searchKey = q.toLowerCase().trim();

  if (autocompleteCache.has(searchKey)) {
    return res.json(autocompleteCache.get(searchKey));
  }

  try {
    const geoRes = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=IN&format=json&limit=5`,
      { headers: { "User-Agent": "co2-digital-twin/1.0" } }
    );

    const suggestions = geoRes.data.map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon)
    }));

    autocompleteCache.set(searchKey, suggestions);
    if (autocompleteCache.size > 500) autocompleteCache.clear();

    res.json(suggestions);
  } catch (err) {
    console.error("❌ Autocomplete error:", err.message);
    res.json([]);
  }
});

console.log("Weather Key:", process.env.WEATHER_API_KEY);
console.log("OpenAQ Key:", process.env.OPENAQ_API_KEY);
console.log("GeoDB Key:", process.env.GEODB_API_KEY);
console.log("Gemini Key:", process.env.GEMINI_API_KEY ? "✅ Loaded" : "❌ Missing");

// 🛡️ AI RATE LIMITERS (tight — protects Gemini API key)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded. Please wait before running another analysis.", retryAfter: 60 }
});
// 📐 CENTRALIZED FORWARD FORMULA (mirrors frontend calculateInterventionCO2 exactly)
function calcForward(base, trees, ev, industry, renewable, windSpeed, temperature, traffic, industryType) {
  const treeReduction     = (Math.log(1 + trees) / Math.log(1 + 10000)) * 0.15 * base;
  const evReduction       = (ev / 100) * 0.20 * base;
  const renewableReduction= (renewable / 100) * 0.30 * base;
  const trafficIncrease   = (traffic / 100) * (1 - ev / 100) * 0.25 * base;
  const industryWeights   = { small: 0.10, medium: 0.25, heavy: 0.45 };
  const industryIncrease  = industry * (industryWeights[industryType] || 0.25) * base;
  const tempMult  = 1 + ((temperature - 25) / 100);
  const windMult  = Math.max(0.5, 1 - (windSpeed / 50));
  const pure = base + trafficIncrease + industryIncrease - treeReduction - evReduction - renewableReduction;
  return Math.round(Math.max(50, pure * tempMult * windMult));
}

// 🤖 ACCURATE OPTIMIZER — inverse formula using baseCO2 so result matches frontend simulation exactly
app.post("/optimize", aiLimiter, async (req, res) => {
  const {
    simulatedCO2, baseCO2, targetPct, windSpeed, temperature, maxTrees,
    city, type,
    currentTrees, currentEv, currentRenewable, currentTraffic, currentIndustry, currentIndustryType
  } = req.body;

  try {
    const tempMult = 1 + ((temperature - 25) / 100);
    const windMult = Math.max(0.5, 1 - (windSpeed / 50));

    // Target CO2 is relative to simulatedCO2 (what the user just ran)
    const targetCO2  = simulatedCO2 * (1 - targetPct / 100);

    // Solve: calcForward(baseCO2, sliders) = targetCO2
    // With traffic=0, industry=0:
    //   (baseCO2 - treeR - evR - renewR) * tempMult * windMult = targetCO2
    //   baseCO2 - treeR - evR - renewR = targetCO2 / (tempMult * windMult)
    const pureTarget = targetCO2 / (tempMult * windMult);
    const totalR     = baseCO2 - pureTarget;  // ← use baseCO2 here, not simulatedCO2

    // Achievability check — floor is 50
    const minPure    = 50 / (tempMult * windMult);
    const maxR       = baseCO2 - minPure;
    const achievable = totalR <= maxR;
    const actualR    = Math.min(totalR, maxR);

    // Proportional distribution: renewable=30/65, ev=20/65, trees=15/65
    const renewShare = actualR * (30 / 65);
    const evShare    = actualR * (20 / 65);
    const treeShare  = actualR * (15 / 65);

    // Solve inverse — all fractions of baseCO2 (matching the forward formula denominators)
    let renewable = Math.min(100, Math.max(0, Math.round((renewShare / (0.30 * baseCO2)) * 100)));
    let ev        = Math.min(100, Math.max(0, Math.round((evShare    / (0.20 * baseCO2)) * 100)));

    // Trees: treeShare = (ln(1+trees)/ln(10001)) * 0.15 * baseCO2  → inverse:
    const treeExp = (treeShare / (0.15 * baseCO2)) * Math.log(1 + 10000);
    let trees     = Math.min(maxTrees, Math.max(0, Math.round(Math.exp(treeExp) - 1)));

    // ✅ Verify with forward formula — now uses baseCO2, exactly matches frontend
    const predictedCO2     = calcForward(baseCO2, trees, ev, 0, renewable, windSpeed, temperature, 0, "medium");
    const achievedPct      = ((simulatedCO2 - predictedCO2) / simulatedCO2 * 100).toFixed(1);
    const maxAchievablePct = ((simulatedCO2 - Math.max(50, simulatedCO2 - maxR)) / simulatedCO2 * 100).toFixed(1);

    // Gemini: 1-sentence reasoning only
    let reasoning = "";
    try {
      const prompt = `You are an environmental analyst. In exactly ONE sentence (max 20 words), explain why renewable energy and EV adoption are prioritized over trees for a ${type} city like ${city} trying to cut CO2 by ${targetPct}% from ${simulatedCO2} to ~${predictedCO2}. No markdown.`;
      reasoning = await geminiWithRetry(prompt);
      reasoning = reasoning.replace(/\n/g, " ");
    } catch { reasoning = ""; }

    res.json({
      trees, ev, renewable,
      traffic: 0, industry: 0, industryType: "medium",
      predictedCO2,
      targetCO2: Math.round(targetCO2),
      achievedPct,
      achievable,
      maxAchievablePct,
      reasoning
    });
  } catch (err) {
    console.error("❌ Optimizer error:", err.message);
    res.status(500).json({ error: "Optimization failed. Please try again." });
  }
});

// 🤖 PHASE 1: POST-SIMULATION AI ANALYST
app.post("/ai-insights", aiLimiter, async (req, res) => {
  const {
    city, type, originalCO2, simulatedCO2, percentChange,
    trees, ev, renewable, traffic, industry, industryType,
    windSpeed, temperature, pm25, no2, so2, o3
  } = req.body;

  try {
    const prompt = `
You are a senior environmental analyst at India's Central Pollution Control Board (CPCB),
specializing in urban air quality for Indian cities. You have deep knowledge of India-specific
pollution drivers: diesel vehicles, crop burning, construction dust, industrial zones, monsoon
patterns, and how city type (metro/urban/rural) shapes pollution profiles.

Analyze this simulation data and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

CITY CONTEXT:
- City: ${city} (${type} region)
- Original CO2 Index: ${originalCO2} | Simulated: ${simulatedCO2} | Change: ${percentChange}%

INTERVENTIONS APPLIED:
- Trees planted: ${Number(trees).toLocaleString()} (max effective for ${type}: logarithmic returns beyond 10,000)
- EV adoption: ${ev}% (note: EV reduces traffic emission impact proportionally)
- Renewable energy: ${renewable}% (highest single-lever impact at 30% weight)
- Traffic density increase: ${traffic}%
- New factories: ${industry} (${industryType} capacity)

LIVE ENVIRONMENT:
- Wind speed: ${windSpeed} km/h — ${windSpeed < 10 ? "very low, pollutants are trapped near ground level" : windSpeed < 25 ? "moderate, partial dispersion" : "high, good pollutant dispersal"}
- Temperature: ${temperature}°C — ${temperature > 35 ? "high heat accelerating ozone formation from NOx" : temperature > 28 ? "warm conditions, moderate ozone risk" : "cooler conditions, lower ozone formation risk"}

OVERALL AQ SEVERITY (pre-computed for your reference):
- Current severity zone: ${pm25 > 90 ? "🔴 RED — SEVERE/HAZARDOUS" : pm25 > 60 ? "🟠 ORANGE — POOR/VERY POOR" : pm25 > 30 ? "🟡 YELLOW — MODERATE" : "🟢 GREEN — SATISFACTORY/GOOD"}
- Simulated severity zone: ${(() => { const sim = pm25 * (simulatedCO2 / originalCO2); return sim > 90 ? "🔴 RED — still SEVERE after interventions" : sim > 60 ? "🟠 ORANGE — still POOR after interventions" : sim > 30 ? "🟡 YELLOW — MODERATE after interventions" : "🟢 GREEN — improved to GOOD"; })()}

RAW AIR QUALITY (with Indian standards):
- PM2.5: ${pm25} µg/m³ | WHO limit: 15 | CPCB safe: 60 | ${pm25 > 90 ? "SEVERE — hazardous zone" : pm25 > 60 ? "POOR — above CPCB limit" : pm25 > 15 ? "MODERATE — above WHO limit" : "GOOD"}
- NO2: ${no2} µg/m³ | CPCB limit: 80 µg/m³ | ${no2 > 80 ? "EXCEEDS CPCB limit" : "Within CPCB limit"}
- SO2: ${so2} µg/m³ | CPCB limit: 80 µg/m³ | ${so2 > 80 ? "EXCEEDS CPCB limit" : "Within CPCB limit"}
- O3: ${o3} µg/m³ | CPCB limit: 100 µg/m³ | ${o3 > 100 ? "EXCEEDS CPCB limit" : "Within CPCB limit"}

ANALYSIS RULES:
1. Be specific to THIS city and region type — avoid generic statements
2. Always mention actual numbers and ratios (e.g., "PM2.5 is 3.2x the CPCB safe limit")
3. For situation: describe severity using CPCB categories (Good/Satisfactory/Moderate/Poor/Very Poor/Severe)
4. For rootCause: identify India-specific drivers relevant to this city type (metro = vehicles + industry, rural = agriculture + biomass burning, coastal = humidity + port activity)
5. For impact: explain HOW each applied intervention worked, mention the EV-traffic interaction if EV > 0
6. For recommendation — tailor urgency to the severity zone:
   - If RED zone (SEVERE/HAZARDOUS): Give 2 urgent, simultaneous actions needed immediately. Use words like "critical", "immediate action required". Mention that single interventions are insufficient at this severity.
   - If ORANGE/YELLOW zone (POOR/MODERATE): Give the single highest-impact unused lever with a specific target value. Explain why it outperforms the others for this city type.
   - If GREEN zone (GOOD/SATISFACTORY): Recommend a maintenance strategy or a small incremental improvement to sustain or further improve the AQ.
7. Never use filler phrases like "it is important to note" or "it should be mentioned"

Respond with EXACTLY this JSON structure (all keys lowercase):
{
  "situation": "1 punchy sentence — lead with CPCB category + the worst pollutant ratio (e.g. 'PM2.5 at 5.9x CPCB limit puts this city in SEVERE zone')",
  "rootCause": "1 sentence — name the top 2 specific India-relevant drivers for this city type, no generic statements",
  "impact": "1-2 sentences — lead with the % change achieved, then explain which lever drove it most and any interaction effect",
  "recommendation": "1 direct sentence — name the exact intervention, exact value, and what % additional reduction it would unlock"
}`;

    const text = await geminiWithRetry(prompt);

    // Strip markdown code fences if Gemini wraps in ```json
    const cleaned = text.replace(/^```json\n?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    console.error("❌ AI Insights error:", err.message);
    res.status(500).json({ error: "AI analysis failed. Please try again." });
  }
});

// 🤖 PHASE 2: AI INTERVENTION OPTIMIZER
app.post("/ai-optimize", aiLimiter, async (req, res) => {
  const { city, type, baseCO2, targetReduction, windSpeed, temperature, maxTrees } = req.body;

  try {
    const prompt = `
You are an environmental optimization AI for Indian cities.
Suggest the optimal intervention values to achieve approximately ${targetReduction}% CO2 reduction for this city.
Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

CITY CONTEXT:
- City: ${city} (${type} region)
- Current CO2 Index: ${baseCO2}
- Target reduction: ${targetReduction}%
- Wind speed: ${windSpeed} km/h
- Temperature: ${temperature}°C

INTERVENTION CONSTRAINTS:
- trees: integer between 0 and ${maxTrees}
- ev: integer between 0 and 100 (percentage)
- renewable: integer between 0 and 100 (percentage)
- traffic: integer between 0 and 100 (keep at 0 unless city type warrants it)
- industry: integer 0, 1, 2, or 3 (number of factories — keep at 0 for reduction goals)
- industryType: "small", "medium", or "heavy"

CO2 REDUCTION WEIGHTS (for reference):
- Renewable energy: 30% weight (highest impact)
- Traffic reduction: 25% weight
- EV adoption: 20% weight
- Tree planting: 15% weight (logarithmic — diminishing returns)

Respond with this exact JSON structure:
{
  "trees": number,
  "ev": number,
  "renewable": number,
  "traffic": number,
  "industry": number,
  "industryType": "small" | "medium" | "heavy",
  "reasoning": "2-3 sentences explaining why these specific values were chosen and which lever is most critical for this city type"
}`;

    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```json\n?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Clamp values to valid ranges
    parsed.trees = Math.min(Math.max(0, Math.round(parsed.trees)), maxTrees);
    parsed.ev = Math.min(Math.max(0, Math.round(parsed.ev)), 100);
    parsed.renewable = Math.min(Math.max(0, Math.round(parsed.renewable)), 100);
    parsed.traffic = Math.min(Math.max(0, Math.round(parsed.traffic)), 100);
    parsed.industry = Math.min(Math.max(0, Math.round(parsed.industry)), 3);

    res.json(parsed);
  } catch (err) {
    console.error("❌ AI Optimizer error:", err.message);
    res.status(500).json({ error: "AI optimization failed. Please try again." });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);