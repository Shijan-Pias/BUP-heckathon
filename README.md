# GridWise — Smart Campus Energy Optimization Service
### BUP CSE Fest 2026 Hackathon · Preliminary Round

GridWise is an automated HTTP API service that minimizes 24-hour campus electricity cost by optimizing grid purchases, solar utilization, and battery storage dispatch, while interpreting natural-language operator notes via LLM.

---

## 1. Architecture Flow

```
[ Request JSON ] 
       │
       ▼
[ 1. Request Validator (Zod) ]
       │
       ▼
[ 2. LLM Directive Parser (Gemini API) ]
       │
       ▼
[ 3. Deterministic Guardrails (Section 08 Validation) ]
       │
       ▼
[ 4. Math Optimizer (24-Hour Linear Programming Solver) ]
       │
       ▼
[ 5. Replay Validator (Energy Balance & Battery Constraints) ]
       │
       ▼
[ Verified Response JSON ]
```

---

## 2. Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | Port for the HTTP server |
| `HOST` | No | `0.0.0.0` | Host binding |
| `GEMINI_API_KEY` | Yes (for live LLM) | `""` | Google Gemini API Key |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Gemini model name |

---

## 3. Quickstart & Run Commands

```bash
# 1. Install dependencies
npm install

# 2. Build & Start (Production)
npm run build
npm start

# Or run in development mode
npm run dev
```

---

## 4. Testing

```bash
# Run all Jest unit & sample tests (45 tests)
npm test

# Run the 10 public sample cases against live server
node test-samples.js

# Run multilingual paraphrase robustness test (24 variations)
node test-paraphrase.js
```

---

## 5. API Endpoints & `curl` Examples

### `GET /health`
```bash
curl http://localhost:3000/health
```
**Response:**
```json
{"status": "ok"}
```

### `POST /optimize-energy`
```bash
curl -X POST http://localhost:3000/optimize-energy \
  -H "Content-Type: application/json" \
  -d @sample1.json
```

**Response Format:**
```json
{
  "scenario_id": "SAMPLE-01",
  "directive_interpretation": [
    {
      "note_index": 0,
      "applies": true,
      "directive_type": "solar_reduction",
      "structured_adjustment": {
        "hours": [12, 13],
        "factor": 0.25
      },
      "explanation": "Solar availability is reduced during panel cleaning."
    },
    {
      "note_index": 1,
      "applies": false,
      "directive_type": "no_op",
      "structured_adjustment": null,
      "explanation": "This note does not affect today's schedule."
    }
  ],
  "hourly_plan": [
    {
      "hour": 0,
      "grid_kwh": 90,
      "solar_used_kwh": 0,
      "battery_action": "idle",
      "battery_kwh": 0,
      "battery_energy_after_kwh": 110
    }
  ],
  "total_grid_kwh": 2692.5,
  "total_cost_bdt": 38365,
  "peak_grid_kwh": 175,
  "plan_summary": "Applies active operational directives and minimizes total grid electricity cost."
}
```

---

## 6. Docker Deployment & Fallback Reference

- **Docker Hub Image Reference**: `pias1111111/gridwise-api:v1`
- **Live Deployed Endpoint**: `https://bup-heckathon.onrender.com`

```bash
# Pull image from Docker Hub
docker pull pias1111111/gridwise-api:v1

# Run container
docker run -d -p 3000:3000 -e GEMINI_API_KEY="your_key" pias1111111/gridwise-api:v1

# Check health
curl http://localhost:3000/health
```

---

## 7. Supported Directives

| Directive Type | Description | `structured_adjustment` |
| :--- | :--- | :--- |
| `solar_reduction` | Curtails solar generation | `{"hours": [int...], "factor": number}` |
| `minimum_battery_reserve` | Minimum battery SOC | `{"hours": [int...], "minimum_energy_kwh": number}` |
| `no_charge_window` | Disables battery charging | `{"hours": [int...]}` |
| `no_discharge_window` | Disables battery discharging | `{"hours": [int...]}` |
| `max_grid_window` | Grid import limit | `{"hours": [int...], "max_grid_kwh": number}` |
| `no_op` | Irrelevant distractor note | `null` (`applies: false`) |

---

## 8. Tech Stack & Dependencies

- **Runtime**: Node.js & TypeScript
- **HTTP Server**: Express, Helmet, CORS
- **Validation**: Zod
- **LLM**: Google Gemini (`@google/generative-ai`)
- **Optimizer**: `javascript-lp-solver` (Linear Programming)
