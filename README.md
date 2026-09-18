# GridWise — Smart Campus Energy Optimization Service
### BUP CSE Fest 2026 Hackathon · Online Preliminary Round

GridWise is an automated, high-precision HTTP API service designed to optimize the 24-hour electricity purchasing and battery storage dispatch for a smart university campus. The system incorporates natural-language operator instructions via an LLM, sanitizes untrusted model interpretations using deterministic guardrails, solves a cost-minimizing Linear Program (LP), and verifies all physical energy and battery constraints prior to dispatch.

---

## 1. Pipeline Architecture

```
                                  [ Incoming Request ]
                                           |
                                           v
                             +----------------------------+
                             |  Request Schema Validator  | (Zod)
                             +--------------+-------------+
                                            |
                                            v
                             +----------------------------+
                             |   LLM Directive Parser     | (Gemini / LLMProvider)
                             +--------------+-------------+
                                            |
                                            v
                             +----------------------------+
                             |   Deterministic Guardrail  | (Section 08 Rules)
                             +--------------+-------------+
                                            |
                                            v
                             +----------------------------+
                             |   Math Optimizer (LP)      | (javascript-lp-solver)
                             +--------------+-------------+
                                            |
                                            v
                             +----------------------------+
                             |   Replay Self-Validator    | (Section 09 Rules)
                             +--------------+-------------+
                                            |
                                            v
                             [ Verified 200 OK JSON Plan  ]
```

### End-to-End Processing Flow:
1. **Request Schema Validation**: Validates JSON types, ensures 24 distinct hours (`0..23`), positive demand, non-negative solar forecasts, and battery limits using Zod.
2. **LLM Interpretation**: Parses 1–3 natural-language operator notes into structured directive objects using Google Gemini API (`@google/generative-ai`) behind a swappable interface.
3. **Deterministic Guardrail Layer**: Deterministically validates that directive types are strictly supported, hours are strictly ascending unique integers (`0..23`), numeric factors and reserve limits are within valid domains, and irrelevant notes are mapped strictly to `no_op` (`applies: false`).
4. **Mathematical Optimizer**: Formulates and solves a 24-hour Simplex Linear Programming problem to minimize total grid electricity purchasing cost subject to battery transitions, capacity bounds, rate limits, and active operator directives.
5. **Final Replay Validator**: Hour-by-hour simulation replay that deterministically confirms every energy balance equation, rate limit, and directive constraint within $0.01$ tolerance before responding.

---

## 2. Technology Stack & Dependencies

- **Runtime & Language**: Node.js v20+ LTS, TypeScript 5+
- **HTTP Server**: Express 4.x with Helmet, CORS, and native JSON body parser
- **Schema Validation**: Zod 3.x
- **LLM Provider**: Google Gemini API via `@google/generative-ai` with clean fallback handling
- **Mathematical Optimization**: Deterministic Simplex Linear Programming via `javascript-lp-solver`
- **Testing**: Jest, `ts-jest`, `ts-node`
- **Containerization**: Multi-stage production Docker image (`node:20-alpine`)

### Credited External Libraries:
- `express` & `cors` & `helmet`: Production HTTP server and security middleware.
- `zod`: Type-safe schema validation.
- `javascript-lp-solver`: Deterministic linear programming solver.
- `@google/generative-ai`: Official Google SDK for Gemini LLM.
- `dotenv`: Environment configuration loader.

---

## 3. Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | Port on which the HTTP server listens |
| `HOST` | No | `0.0.0.0` | Host network interface binding |
| `NODE_ENV` | No | `production` | Environment mode (`development` / `production`) |
| `GEMINI_API_KEY` | Yes (for live LLM) | `""` | Google Gemini API Key |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Gemini model version (`gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-flash-latest`) |
| `API_BASE_URL` | No | `http://127.0.0.1:PORT` | Base URL used by test harnesses |

---

## 4. Local Setup & Quickstart

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Step 1: Clone and Install
```bash
git clone <repository_url>
cd BUP
npm install
```

### Step 2: Configure Environment
Create a `.env` file from the provided `.env.example`:
```bash
cp .env.example .env
```
Edit `.env` to include your `GEMINI_API_KEY`:
```ini
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
```

### Step 3: Build and Run

**Development Mode (Live TypeScript execution):**
```bash
npm run dev
```

**Production Build & Start:**
```bash
npm run build
npm start
```

---

## 5. API Endpoints & `curl` Examples

### 1. Health Readiness Endpoint: `GET /health`
Verifies that the service is running and ready for evaluation traffic.

**Request:**
```bash
curl -i -X GET http://localhost:3000/health
```

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

---

### 2. Primary Optimization Endpoint: `POST /optimize-energy`
Accepts a 24-hour campus scenario with operator notes and returns structured directive interpretations along with the cost-minimized hourly dispatch schedule.

**Request Example:**
```bash
curl -X POST http://localhost:3000/optimize-energy \
  -H "Content-Type: application/json" \
  -d '{
    "scenario_id": "SAMPLE-01",
    "operator_notes": [
      "Facilities will wash the rooftop solar panels from noon until 2 PM. During cleaning, usable solar should be treated as roughly 25% of the forecast.",
      "The sports office moved next month registration deadline."
    ],
    "hours": [
      {"hour": 0, "demand_kwh": 90, "solar_kwh": 0, "tariff_bdt_per_kwh": 6},
      {"hour": 1, "demand_kwh": 85, "solar_kwh": 0, "tariff_bdt_per_kwh": 6},
      {"hour": 2, "demand_kwh": 80, "solar_kwh": 0, "tariff_bdt_per_kwh": 5},
      {"hour": 3, "demand_kwh": 80, "solar_kwh": 0, "tariff_bdt_per_kwh": 5},
      {"hour": 4, "demand_kwh": 85, "solar_kwh": 0, "tariff_bdt_per_kwh": 5},
      {"hour": 5, "demand_kwh": 95, "solar_kwh": 0, "tariff_bdt_per_kwh": 6},
      {"hour": 6, "demand_kwh": 110, "solar_kwh": 5, "tariff_bdt_per_kwh": 8},
      {"hour": 7, "demand_kwh": 130, "solar_kwh": 20, "tariff_bdt_per_kwh": 10},
      {"hour": 8, "demand_kwh": 150, "solar_kwh": 50, "tariff_bdt_per_kwh": 12},
      {"hour": 9, "demand_kwh": 165, "solar_kwh": 90, "tariff_bdt_per_kwh": 14},
      {"hour": 10, "demand_kwh": 175, "solar_kwh": 130, "tariff_bdt_per_kwh": 16},
      {"hour": 11, "demand_kwh": 180, "solar_kwh": 160, "tariff_bdt_per_kwh": 16},
      {"hour": 12, "demand_kwh": 185, "solar_kwh": 180, "tariff_bdt_per_kwh": 15},
      {"hour": 13, "demand_kwh": 180, "solar_kwh": 170, "tariff_bdt_per_kwh": 14},
      {"hour": 14, "demand_kwh": 170, "solar_kwh": 140, "tariff_bdt_per_kwh": 13},
      {"hour": 15, "demand_kwh": 165, "solar_kwh": 90, "tariff_bdt_per_kwh": 14},
      {"hour": 16, "demand_kwh": 170, "solar_kwh": 45, "tariff_bdt_per_kwh": 18},
      {"hour": 17, "demand_kwh": 185, "solar_kwh": 10, "tariff_bdt_per_kwh": 22},
      {"hour": 18, "demand_kwh": 205, "solar_kwh": 0, "tariff_bdt_per_kwh": 28},
      {"hour": 19, "demand_kwh": 215, "solar_kwh": 0, "tariff_bdt_per_kwh": 30},
      {"hour": 20, "demand_kwh": 205, "solar_kwh": 0, "tariff_bdt_per_kwh": 26},
      {"hour": 21, "demand_kwh": 175, "solar_kwh": 0, "tariff_bdt_per_kwh": 18},
      {"hour": 22, "demand_kwh": 135, "solar_kwh": 0, "tariff_bdt_per_kwh": 10},
      {"hour": 23, "demand_kwh": 105, "solar_kwh": 0, "tariff_bdt_per_kwh": 7}
    ],
    "battery": {
      "capacity_kwh": 220,
      "initial_energy_kwh": 110,
      "minimum_energy_kwh": 40,
      "max_charge_kwh_per_hour": 50,
      "max_discharge_kwh_per_hour": 50
    }
  }'
```

**Response (200 OK):**
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
      "explanation": "Solar availability is reduced to 25% during the panel-cleaning window."
    },
    {
      "note_index": 1,
      "applies": false,
      "directive_type": "no_op",
      "structured_adjustment": null,
      "explanation": "This note does not affect today's 24-hour energy schedule."
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
    },
    {
      "hour": 1,
      "grid_kwh": 45,
      "solar_used_kwh": 0,
      "battery_action": "discharge",
      "battery_kwh": 40,
      "battery_energy_after_kwh": 70
    },
    {
      "hour": 2,
      "grid_kwh": 130,
      "solar_used_kwh": 0,
      "battery_action": "charge",
      "battery_kwh": 50,
      "battery_energy_after_kwh": 120
    }
  ],
  "total_grid_kwh": 2692.5,
  "total_cost_bdt": 38365,
  "peak_grid_kwh": 175,
  "plan_summary": "Applies active operational directives (solar_reduction), respects all battery bounds and rate limits, and minimizes total grid electricity cost."
}
```

---

## 6. Mathematical Model & Directives Specification

### Optimization Objective
Minimize the total cost of electricity purchased from the utility grid across all 24 hours:
$$\min \sum_{h=0}^{23} \text{grid\_kwh}[h] \times \text{tariff\_bdt\_per\_kwh}[h]$$

### Constraints:
1. **Energy Balance (every hour $h$):**
   $$\text{grid\_kwh}[h] + \text{solar\_used\_kwh}[h] + \text{discharge}[h] = \text{demand\_kwh}[h] + \text{charge}[h]$$
2. **Effective Solar Availability:**
   $$0 \le \text{solar\_used\_kwh}[h] \le \text{effective\_solar\_kwh}[h]$$
3. **Battery State Dynamics:**
   $$E_{\text{after}}[h] = E_{\text{after}}[h-1] + \text{charge}[h] - \text{discharge}[h]$$
4. **Battery Energy Bounds:**
   $$\max(E_{\min}, \text{directive\_min}[h]) \le E_{\text{after}}[h] \le \text{capacity\_kwh}$$
5. **Charge & Discharge Rate Limits:**
   $$0 \le \text{charge}[h] \le \text{max\_charge\_kwh\_per\_hour}$$
   $$0 \le \text{discharge}[h] \le \text{max\_discharge\_kwh\_per\_hour}$$
6. **End-of-Day Neutrality:**
   $$E_{\text{after}}[23] = E_{\text{initial}}$$

### Supported Directive Adjustments:
| Directive Type | Meaning | `structured_adjustment` Format |
| :--- | :--- | :--- |
| `solar_reduction` | Curtails available solar output | `{"hours": [int...], "factor": number}` |
| `minimum_battery_reserve` | Enforces higher minimum energy level | `{"hours": [int...], "minimum_energy_kwh": number}` |
| `no_charge_window` | Prohibits battery charging | `{"hours": [int...]}` |
| `no_discharge_window` | Prohibits battery discharging | `{"hours": [int...]}` |
| `max_grid_window` | Imposes maximum grid import cap | `{"hours": [int...], "max_grid_kwh": number}` |
| `no_op` | Irrelevant note (distractor) | `null` (`applies: false`) |

---

## 7. Testing & Validation Scripts

### 1. Run Complete Jest Test Suite (45/45 Unit & Sample Tests)
```bash
npm test
```

### 2. Run Public Sample Cases Test Script
```bash
node test-samples.js
```
Reads `docs/sample-cases.json`, sends each case to the live API, and validates:
- Schema adherence (24 hourly entries, proper directive counts)
- Semantic directive extraction
- Physical energy balance and battery constraints replay
- Optimal cost equivalence

### 3. Run Multilingual Paraphrase Robustness Test
```bash
node test-paraphrase.js
```
Executes 24 varied paraphrased notes across multiple languages (English, Bengali, 24-hour time notation) to verify generalizability without hard-coded phrase matching.

---

## 8. Docker Build & Deployment

### Build the Production Container
```bash
docker build -t gridwise-api:latest .
```

### Run the Container
```bash
docker run -d \
  -p 3000:3000 \
  -e GEMINI_API_KEY="your_api_key_here" \
  -e PORT=3000 \
  --name gridwise-service \
  gridwise-api:latest
```

### Check Container Health
```bash
curl http://localhost:3000/health
```

---

## 9. Known Limitations & Security

1. **No Baked-in Secrets**: The Docker image and codebase contain zero baked-in credentials. Keys are provided strictly at runtime via environment variables (`GEMINI_API_KEY`).
2. **Quota & Downtime Resilience**: If external LLM API rate limits (HTTP 429) or upstream outages (HTTP 503) occur during evaluation, the service automatically fails over to the built-in deterministic heuristic parser, preventing judge failures and server crashes.
3. **No Grid Export**: Solar energy exceeding campus load and battery charging capacity is curtailed as specified; grid feed-in / export is not modeled.
4. **Whole-Hour Time Intervals**: Operational time windows adhere strictly to start-inclusive, end-exclusive whole-hour intervals (`0..23`).
