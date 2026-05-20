# Environmental Digital Twin (AI-Powered)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Available-success?style=for-the-badge)](https://co2-digital-twin.netlify.app/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)](#)

A full-stack, data-driven Geospatial AI Platform that creates a digital twin of Indian cities to simulate environmental interventions. Built to help urban planners and environmental analysts predict the exact impact of policy changes (like EV adoption, tree planting, and renewable energy) on regional CO2 levels.

---

## Key Features & Technical Highlights

### 1. Real-Time Data Aggregation
- Integrates OpenAQ and OpenWeatherMap APIs to fetch real-time PM2.5, NO2, SO2, O3, wind speed, and temperature.
- Utilizes GeoDB Cities API for population density classification to automatically categorize regions as rural, urban, or metropolitan.

### 2. Mathematical Simulation Engine
- Built a custom Forward Formula Simulation utilizing logarithmic tree-capacity scaling, EV-traffic interaction multipliers, and weather-based dispersion algorithms.
- Implemented a complex Inverse Math Solver on the backend that calculates the exact slider interventions required to hit a specific target CO2 reduction (e.g., "What exact parameters are needed to drop CO2 by 20%?").

### 3. LLM AI Integration (Gemini 2.5)
- AI Analyst: Ingests live weather, pollution, and simulated data to generate highly contextual, non-generic environmental reports formatted for policy-makers.
- Smart Optimizer Reasoning: Explains the mathematical reasoning behind the inverse solver's suggestions in a single, actionable sentence.
- Resilience Engineering: Built custom exponential backoff retry wrappers to gracefully handle LLM rate limits (429) and server overloads (503).

### 4. Interactive Geospatial UI
- Built with React-Leaflet, featuring interactive choropleth maps (GeoJSON) with dynamic color-coding based on live Air Quality metrics.

---

## System Architecture

- Frontend: React (Vite), React-Leaflet, Tailwind/Vanilla CSS
- Backend: Node.js, Express.js
- AI / LLM: Google Gemini 2.5 Flash API
- External Data: OpenAQ, OpenWeather, GeoDB
- Deployment: Dockerized backend on Render, Frontend on Netlify

### How the Inverse Optimizer Works
Unlike standard LLM wrappers, the AI does not guess the math. The Node.js backend handles deterministic algebraic inversion of the simulation formula, while Gemini is strictly utilized for contextual reasoning. This hybrid approach guarantees 100% mathematical accuracy while maintaining human-readable insights.

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
