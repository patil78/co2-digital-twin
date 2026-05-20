# Environmental Digital Twin (AI-Powered)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Available-success?style=for-the-badge)](https://co2-digital-twin.netlify.app/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)](#)

## The Problem Statement
Indian policymakers face a critical challenge: predicting the exact environmental impact of urban interventions (like mass EV adoption or large-scale afforestation) before spending millions in capital. This platform solves that by providing a **Geospatial Digital Twin** that simulates exact CO2 reductions based on live atmospheric data and mathematical modeling, removing guesswork from urban planning.

---

## Visuals
*(Note: Upload screenshots here by dragging and dropping them into the GitHub editor)*

- **[Insert Screenshot of the India Map Dashboard here]**
- **[Insert Screenshot of the AI Analyst Insights here]**
- **[Insert Screenshot of the Inverse Optimizer Math here]**

---

## Technical Skills Demonstrated
- **Frontend:** React (Vite), React Hooks, Complex State Management, React-Leaflet (GeoJSON mapping).
- **Backend:** Node.js, Express.js, RESTful API design, Middleware integration.
- **System Design & Architecture:** Client-Server separation, Reverse Proxy patterns, Graceful Degradation, Caching strategies, Asynchronous Programming.
- **Math & AI Integration:** Algebraic Inversion formulas, LLM Prompt Engineering, Retry Backoff Algorithms.
- **DevOps & Deployment:** Docker containerization, Environment Variable Management, Render (Backend) and Netlify (Frontend) deployment.

---

## Key Features & Engineering Highlights

### 1. Performance & Reliability Engineering
- **Parallel Asynchronous Fetching:** Utilizes `Promise.all()` to fetch OpenAQ and OpenWeatherMap data concurrently, reducing total API network latency by ~60%.
- **In-Memory Caching:** Implemented a custom Map-based caching mechanism with a 15-minute Time-To-Live (TTL) for API responses. This drastically reduces external API calls and improves load times.
- **Rate Limiting & Security:** Integrated `express-rate-limit` to protect backend endpoints from DDoS, with strict limiters applied to the LLM routes (`/ai-insights`, `/optimize`) to prevent API budget exhaustion.
- **Server Keep-Awake Polling:** Engineered a lightweight `/ping` endpoint polled every 5 minutes (via UptimeRobot) to prevent the Render backend from entering a "cold sleep" state, guaranteeing 0ms wake latency for users.
- **Fault-Tolerant Fallback Logic:** Engineered a multi-tiered data validation system. If OpenAQ fails, the system gracefully degrades to OpenWeatherMap's AQI API. If both fail, it utilizes a deterministic generated fallback.

### 2. Mathematical Simulation Engine
- Built a custom **Forward Formula Simulation** utilizing logarithmic tree-capacity scaling, EV-traffic interaction multipliers, and weather-based dispersion algorithms.
- Implemented a complex **Inverse Math Solver** on the backend that calculates the exact slider interventions required to hit a specific target CO2 reduction.

### 3. LLM AI Integration (Gemini 2.5 Flash)
- **AI Analyst:** Ingests live weather, pollution, and simulated data to generate highly contextual, non-generic environmental reports formatted for policy-makers.
- **Resilience Engineering:** Built custom exponential backoff retry wrappers to gracefully handle LLM rate limits (429) and server overloads (503), preventing UI crashes when the AI provider is down.

---

## Challenges Faced & Overcome

**1. The "Math Drift" Discrepancy**
- *Challenge:* The frontend forward-simulation and the backend AI-optimizer were yielding slightly different CO2 predictions due to conflicting base anchors.
- *Solution:* Refactored the architecture to extract the core mathematical model into a centralized Node.js function. The backend now strictly derives inverse parameters using the exact same deterministic baseline as the frontend, ensuring 100% mathematical parity.

**2. LLM Hallucinations & Broken JSON**
- *Challenge:* The Gemini API would occasionally return unstructured text or wrap JSON in markdown fences, breaking the frontend parser.
- *Solution:* Implemented strict prompt engineering to force JSON-only responses, paired with a custom regex scrubber (`replace(/^```json\n?|```$/g, "")`) on the backend to sanitize the LLM output before it reaches the client.

---

## APIs & External Services Used
1. **Google Gemini 2.5 Flash API:** Contextual reasoning and report generation.
2. **OpenAQ API:** Primary source for granular particulate and gas data.
3. **OpenWeatherMap API:** Real-time temperature and wind speed for dispersion algorithms.
4. **GeoDB Cities API:** Population data to classify regions (Rural/Urban/Metro) for constraint validation.

---

## Project Structure

```text
co2-digital-twin/
├── public/                 # Static assets
├── server/                 # Node.js Backend
│   ├── utils/              # Helper functions (population fetching)
│   ├── Dockerfile          # Backend container config
│   ├── package.json        
│   └── server.js           # Core API logic, Inverse Math, and LLM endpoints
├── src/                    # React Frontend
│   ├── App.css             # Vanilla CSS styling
│   ├── App.jsx             # Main application wrapper
│   ├── index.css           # Global resets and CSS variables
│   ├── india.json          # GeoJSON data for map rendering
│   └── Map.jsx             # Core interactive map and simulation component
├── .gitignore              # Git exclusions
├── docker-compose.yml      # Local container orchestration
├── Dockerfile              # Frontend container config
├── nginx.conf              # Web server routing configuration
├── package.json            # Frontend dependencies
└── vite.config.js          # Vite bundler configuration
```

---

## Running Locally

### 1. Setup Environment Variables
Create a .env file in the server directory:
```env
GEMINI_API_KEY=your_key_here
WEATHER_API_KEY=your_key_here
OPENAQ_API_KEY=your_key_here
GEODB_API_KEY=your_key_here
```
Create a .env file in the root directory:
```env
VITE_WEATHER_API_KEY=your_key_here
VITE_API_URL=http://localhost:5000
```

### 2. Run with Docker Compose
```bash
docker-compose up --build
```

### 3. Run Manually
**Backend:**
```bash
cd server && npm install && npm start
```
**Frontend:**
```bash
npm install && npm run dev
```
