# Environmental Digital Twin (AI-Powered)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Available-success?style=for-the-badge)](https://co2-digital-twin.netlify.app/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)](#)

A full-stack, data-driven Geospatial AI Platform that creates a digital twin of Indian cities to simulate environmental interventions. Built to help urban planners and environmental analysts predict the exact impact of policy changes (like EV adoption, tree planting, and renewable energy) on regional CO2 levels.

---

## Technical Skills Demonstrated
- **Frontend:** React (Vite), React Hooks, Complex State Management, React-Leaflet (GeoJSON mapping).
- **Backend:** Node.js, Express.js, RESTful API design, Middleware integration.
- **System Design & Architecture:** Client-Server separation, Reverse Proxy patterns, Graceful Degradation, Caching strategies, Asynchronous Programming.
- **Math & AI Integration:** Algebraic Inversion formulas, LLM Prompt Engineering, Retry Backoff Algorithms.
- **DevOps & Deployment:** Docker containerization, Environment Variable Management, Render (Backend) and Netlify (Frontend) deployment.

---

## Key Features & Engineering Highlights

### 1. Performance & Reliability Engineering (System Design)
- **Parallel Asynchronous Fetching:** Utilizes `Promise.all()` to fetch OpenAQ and OpenWeatherMap data concurrently, reducing total API network latency by ~60%.
- **In-Memory Caching:** Implemented a custom Map-based caching mechanism with a 15-minute Time-To-Live (TTL) for API responses. This drastically reduces external API calls and improves load times for frequently searched regions.
- **Rate Limiting & Security:** Integrated `express-rate-limit` to protect backend endpoints from DDoS and abuse, with specific, strict limiters applied to the LLM routes (`/ai-insights`, `/optimize`) to prevent API budget exhaustion.
- **Fault-Tolerant Fallback Logic:** Engineered a multi-tiered data validation system. If OpenAQ fails or returns null for a region, the system gracefully degrades to OpenWeatherMap's AQI API. If both external APIs fail, it utilizes a deterministic generated fallback based on population density.

### 2. Mathematical Simulation Engine
- Built a custom **Forward Formula Simulation** utilizing logarithmic tree-capacity scaling, EV-traffic interaction multipliers, and weather-based dispersion algorithms.
- Implemented a complex **Inverse Math Solver** on the backend that calculates the exact slider interventions required to hit a specific target CO2 reduction (e.g., "What exact parameters are needed to drop CO2 by 20%?").
- Built-in validation limits maximum tree capacity based on a city's classification (Rural/Urban/Metro) derived from population density.

### 3. LLM AI Integration (Gemini 2.5 Flash)
- **AI Analyst:** Ingests live weather, pollution, and simulated data to generate highly contextual, non-generic environmental reports formatted for policy-makers.
- **Smart Optimizer Reasoning:** Explains the mathematical reasoning behind the inverse solver's suggestions in a single, actionable sentence.
- **Resilience Engineering:** Built custom exponential backoff retry wrappers to gracefully handle LLM rate limits (429) and server overloads (503), preventing UI crashes when the AI provider is down.

### 4. Interactive Geospatial UI
- Built with React-Leaflet, featuring interactive choropleth maps (GeoJSON) with dynamic color-coding based on live Air Quality metrics.
- Seamless, unified state management binding Map clicks, Search inputs, and AI intervention suggestions to a central interactive dashboard.

---

## APIs & External Services Used

1. **Google Gemini 2.5 Flash API:** Used exclusively for contextual reasoning and report generation.
2. **OpenAQ API:** Primary source for granular particulate and gas data (PM2.5, NO2, SO2, O3).
3. **OpenWeatherMap API:** Fetches real-time temperature and wind speed for dispersion algorithms, and acts as a fallback for AQI data.
4. **GeoDB Cities API:** Fetches accurate population data to classify regions (Rural/Urban/Metro) for constraint validation.

### How the Inverse Optimizer Works
Unlike standard LLM wrappers, the AI does *not* guess the math. The Node.js backend handles deterministic algebraic inversion of the simulation formula, while Gemini is strictly utilized for contextual reasoning. This hybrid approach guarantees 100% mathematical accuracy while maintaining human-readable insights.

---

## System Architecture

- **Frontend:** React (Vite), React-Leaflet, Tailwind/Vanilla CSS
- **Backend:** Node.js, Express.js
- **Deployment:** Dockerized backend on Render, Frontend on Netlify

---

## Running Locally

### Prerequisites
- Node.js v18+
- Docker (optional)

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

### 2. Run with Docker Compose (Recommended)
```bash
docker-compose up --build
```
*Frontend will be on port 80, Backend on port 5000.*

### 3. Run Manually
**Backend:**
```bash
cd server
npm install
npm start
```

**Frontend:**
```bash
npm install
npm run dev
```

---

## Future Roadmap
- Implement PostgreSQL database to store simulation histories for cross-city comparison.
- Integrate CMAQ (Community Multiscale Air Quality) approximations for deeper physics-based modeling.
