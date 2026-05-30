# 🚌 Multi-Stop Transit Router

Solves the problem that major mapping apps (Google Maps, Apple Maps) disable multi-stop routing in transit mode because they can't handle time-dependent layovers. This app orchestrates sequential, time-shifted transit queries into a single unified itinerary.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (Vite / TypeScript)                     │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────┐  │
│  │  Stop Planner│  │  Timeline View  │  │ Leaflet Map│  │
│  └──────────────┘  └─────────────────┘  └────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ POST /api/transit/route
┌───────────────────────▼─────────────────────────────────┐
│  Spring Boot Backend                                    │
│                                                         │
│  TransitController                                      │
│       │                                                 │
│  TransitOrchestrationService  ◄── The Brain             │
│       │                                                 │
│       │  For each consecutive stop pair:                │
│       │    1. Query API at cursor time                  │
│       │    2. Parse arrival time                        │
│       │    3. Add layover → new cursor                  │
│       │    4. Query next leg at new cursor              │
│       │                                                 │
│  GoogleDirectionsClient  (Caffeine cache)               │
│       │                                                 │
└───────┼─────────────────────────────────────────────────┘
        │ HTTPS
  Google Directions API
  (or OpenTripPlanner)
```

---

## Setup

### 1. Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Directions API**
3. Create an API key, restrict it to Directions API

### 2. Configure the backend

```bash
export GOOGLE_MAPS_API_KEY=your_key_here
```

Or edit `src/main/resources/application.properties`:
```properties
transit.google.api-key=your_key_here
```

### 3. Run the backend

```bash
cd transit-router
./mvnw spring-boot:run
```

Backend starts on `http://localhost:8080`

### 4. Run the frontend

```bash
cd transit-router-frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:5173`

---

## API Reference

### `POST /api/transit/route`

**Request:**
```json
{
  "departureTime": "2025-06-01T18:30:00",
  "optimiseOrder": false,
  "stops": [
    { "name": "Bishan MRT Station", "stayMinutes": 0 },
    { "name": "Chomp Chomp Food Centre", "stayMinutes": 45 },
    { "name": "Bishan MRT Station", "stayMinutes": 0 }
  ]
}
```

Or with coordinates (avoids geocoding round-trip):
```json
{
  "stops": [
    { "name": "Home", "lat": 1.3508, "lng": 103.8485, "stayMinutes": 0 },
    ...
  ]
}
```

**Response:**
```json
{
  "departureTime": "06:30 PM",
  "arrivalTime":   "08:15 PM",
  "totalDurationMinutes": 105,
  "legs": [
    {
      "legIndex": 0,
      "from": "Bishan MRT Station",
      "to":   "Chomp Chomp Food Centre",
      "departureTime": "06:30 PM",
      "arrivalTime":   "06:48 PM",
      "durationMinutes": 18,
      "mode": "BUS",
      "line": "Bus 73",
      "polyline": [ { "lat": 1.3508, "lng": 103.8485 }, "..." ],
      "steps": [ "..." ]
    },
    {
      "legIndex": 1,
      "from": "Chomp Chomp Food Centre",
      "to":   "Bishan MRT Station",
      "departureTime": "07:33 PM",
      "arrivalTime":   "07:51 PM",
      "..."
    }
  ],
  "stops": [
    { "name": "Bishan MRT Station",     "arrivalTime": null,       "departureTime": "06:30 PM", "stay": 0  },
    { "name": "Chomp Chomp Food Centre", "arrivalTime": "06:48 PM", "departureTime": "07:33 PM", "stay": 45 },
    { "name": "Bishan MRT Station",     "arrivalTime": "07:51 PM", "departureTime": null,        "stay": 0  }
  ]
}
```

---

## Phase 2: TSP Optimisation

Set `"optimiseOrder": true` in the request body. The backend will:

1. Pin origin and destination
2. Run a **nearest-neighbour heuristic** on intermediate waypoints
3. At each step, probe the Directions API from the current position to each remaining candidate
4. Greedily select the fastest next stop

**Complexity:** O(n²) API calls where n = number of intermediate stops. Works well for ≤ 8 waypoints. For more, consider [LKH-3](http://webhotel4.ruc.dk/~keld/research/LKH-3/) or a proper DP Held-Karp implementation.

---

## Extending to OpenTripPlanner

OTP is free and uses GTFS feeds (perfect for Singapore's LTA data). To switch:

1. Set `transit.provider=otp` in `application.properties`
2. Set `transit.otp.base-url=http://localhost:8080/otp/routers/default/plan`
3. Implement `OtpDirectionsClient` using OTP's REST API (identical interface to `GoogleDirectionsClient`)

---

## Running Tests

```bash
./mvnw test
```

The `TransitOrchestrationServiceTest` mocks the API client and verifies:
- Time cursor advances correctly after each layover
- Leg 2's departure epoch = leg 1 arrival + stay duration
- Cumulative time shifts with multiple layovers
- Response shape validation

---

## Credits

- **LTA Identity Font** — UI typography uses a reconstruction of the LTA Identity typeface by [jglim](https://github.com/jglim/IdentityFont), a humanistic sans-serif font found in Singapore's public transport graphics. Used under the terms of that repository.