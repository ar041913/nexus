<div align="center">

# NEXUS.ai

### Enterprise KPI Intelligence-to-Action Engine

**Built for:** Accenture Innovation Challenge 2026  


[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-000000?style=flat&logo=next.js)](https://nextjs.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-1.1-FFF000?style=flat&logo=duckdb)](https://duckdb.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Render](https://img.shields.io/badge/Render-Deploy-46E3B7?style=flat&logo=render)](https://render.com/)

</div>

---

## 📋 Executive Summary

NEXUS.ai is a **modular monolith** that ingests heterogeneous business data, computes KPIs deterministically via SQL contracts, detects material movements, attributes drivers with statistics, grounds findings in traceable evidence, generates persona-specific narratives (LLM synthesis only — never LLM calculation), recommends constrained actions, simulates what-if scenarios, and captures feedback for learning.

> **Key Architectural Principle:** Quantitative truth lives in SQL + Python statistics. LLMs are strictly used for narrative synthesis, persona framing, and intent parsing — never for computing KPIs, rankings, or confidence scores.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER (Next.js 15 + React 19)                    │
│  Dashboard │ KPI Detail │ Driver Explorer │ Actions │ Simulate │ Feedback   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTPS / REST API
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                     API GATEWAY LAYER (FastAPI)                             │
│  CORS Middleware │ RBAC Enforcer │ Telemetry │ Request ID │ Audit           │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ Orchestration │         │  Query / Read   │         │  Admin / Config │
│ Pipeline Svc  │         │  Services       │         │  (KPI Contracts)│
└───────┬───────┘         └────────┬────────┘         └─────────────────┘
        │                          │
        ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     ANALYTICS CORE (Python Packages)                       │
│  Ingest │ Reconcile │ KPI Engine │ Detect │ Explain │ Confidence │ Act   │
└───────┬───────────────────────────────┬───────────────────────────────────┘
        │                               │
        ▼                               ▼
┌───────────────────┐         ┌───────────────────┐         ┌──────────────┐
│ DuckDB (Analytics)│         │ PostgreSQL (App)  │         │ LLM Provider │
│ Source mirrors    │         │ Audit │ Feedback  │         │ Abstraction  │
│ KPI facts │ Lineage│         │ Telemetry │ Users │         │ (OpenAI API) │
└───────────────────┘         └───────────────────┘         └──────────────┘
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| **Frontend** (`apps/web`) | Persona-aware UX, evidence drill-down, abstention UX, simulation controls, KPI charts |
| **API** (`apps/api`) | Thin controllers; no business logic; enforce auth, contracts, audit logging |
| **Analytics Core** (`packages/analytics`) | All numbers, statistics, rankings, confidence, abstention decisions, action recommendations |
| **DuckDB** | Analytical queries, KPI SQL execution, reconciliation staging, driver feature tables |
| **PostgreSQL** | Users, roles, narratives cache, actions, feedback, telemetry, audit log (optional) |
| **LLM Adapter** (`packages/llm`) | Structured prompts in → validated JSON narrative out; token/cost metering |

### Non-Goals (Prototype Scope)

- ❌ No Kubernetes / microservices — modular monolith only
- ❌ No real-time streaming — batch + scheduled refresh simulated
- ❌ No custom causal discovery — pragmatic statistical methods + abstention
- ❌ No multi-tenant isolation beyond role-based row/column filters

---

## 🔄 End-to-End Workflow

The pipeline follows the **SIGNAL → DETECT → EXPLAIN → GROUND → DECIDE → SIMULATE → LEARN** paradigm:

```mermaid
flowchart LR
    subgraph SIGNAL["① SIGNAL"]
        S1[Source CSV Seeds] --> S2[Ingest + Normalize]
        S2 --> S3[Reconciliation Layer]
    end

    subgraph DETECT["② DETECT"]
        S3 --> D1[KPI SQL Engine via Contracts]
        D1 --> D2[Materiality Rules Engine]
        D2 --> D3[Anomaly Detection + Z-Score]
    end

    subgraph EXPLAIN["③ EXPLAIN"]
        D3 --> E1[Driver Feature Matrix Build]
        E1 --> E2[Decomposition + Correlation + Granger]
        E2 --> E3[Hypothesis Ranking]
    end

    subgraph GROUND["④ GROUND"]
        E3 --> G1[Evidence Retrieval: SKU/Region/Tickets]
        G1 --> G2[Lineage DAG + Freshness Join]
        G2 --> G3[Weighted Confidence Fusion]
    end

    subgraph DECIDE["⑤ DECIDE"]
        G3 --> C1{Abstain?}
        C1 -->|No| C2[Rule-Based Action Recommender]
        C1 -->|Yes| C3[Competing Hypotheses UI]
        C2 --> C4[RBAC + Decision Rights Filter]
    end

    subgraph SIMULATE["⑥ SIMULATE"]
        C4 --> SIM1[Lever Model Calibration]
        SIM1 --> SIM2[Deterministic What-If Engine]
    end

    subgraph LEARN["⑦ LEARN"]
        SIM2 --> L1[Feedback Capture API]
        L1 --> L2[Outcome Labels Store]
        L2 --> L3[Rule/Weight Tuning for Explain Stage]
    end

    G3 --> N1[LLM Narrative Synthesis]
    N1 --> UI[Persona Dashboard]
    C3 --> N1
```

### Pipeline Stage Timing (Demo Targets)

| Stage | Input | Output | Max Duration |
|-------|-------|--------|--------------|
| 1. Ingest | CSV seeds + scenario overlay | Staging tables | 5s |
| 2. Reconcile | Staging + SKU/date mapping | Conformed facts + DQ report | 10s |
| 3. KPI Compute | YAML contracts + facts | `kpi_observations` | 5s |
| 4. Detect | Observations + materiality | `signals` (severity, z-score) | 3s |
| 5. Explain | Signal context + features | Ranked `driver_candidates` | 15s |
| 6. Ground | Drivers + facts | `evidence_items` + lineage | 5s |
| 7. Confidence | All stages | `analysis_verdict` | 2s |
| 8. Narrate (LLM) | Frozen facts JSON + persona | `narratives` | 5–15s |
| 9. Decide | Verdict + drivers + levers | `action_recommendations` | 3s |
| 10. Simulate (optional) | User-triggered levers | KPI impact projections | 2s |

---

## 🛠️ Tech Stack

### Backend / Analytics

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Web Framework** | FastAPI | ≥0.115 | REST API, middleware, routing |
| **ASGI Server** | Uvicorn | ≥0.32 | Production async server |
| **Data Validation** | Pydantic | ≥2.9 | Request/response models, settings |
| **Analytics Engine** | Python | ≥3.11 | Core analytics pipeline |
| **SQL Engine** | DuckDB | ≥1.1 | In-process analytical database |
| **Data Frames** | Pandas | ≥2.2 | Data manipulation |
| **Numerical** | NumPy | ≥2.1 | Vectorized operations |
| **Statistics** | SciPy | ≥1.14 | P-values, distributions |
| **ML / Stats** | scikit-learn | ≥1.5 | Regression, anomaly detection |
| **Time Series** | Statsmodels | ≥0.14 | Granger causality, STL |
| **App DB** | PostgreSQL | 16 (via Docker) | State persistence (optional) |
| **HTTP Client** | httpx | ≥0.27 | LLM API calls |
| **Testing** | pytest | ≥8.3 | Unit + integration tests |

### Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | Next.js | 15.1 | App Router, SSR, RSC |
| **UI Library** | React | 19 | Component model |
| **Language** | TypeScript | ≥5 | Type safety |
| **Styling** | Tailwind CSS | ≥3.4 | Utility-first CSS |
| **UI Primitives** | shadcn/ui | 4.x | Design system components |
| **UI Base** | Base UI | 1.7 | Unstyled primitives |
| **Charts** | Recharts | 3.10 | Line charts, sparklines |
| **Icons** | Lucide React | 1.33 | Consistent icon set |
| **CSS Utils** | clsx + tailwind-merge | latest | Conditional class composition |
| **Linting** | ESLint | 9 | Code quality |

### Infrastructure / DevOps

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Containerization** | Docker Compose | Local PostgreSQL service |
| **Deployment** | Render (YAML-defined) | Zero-config PaaS deployment |
| **Backend Dockerfile** | `Dockerfile.api` | Python/FastAPI image |
| **Frontend Dockerfile** | `Dockerfile.web` | Next.js image |
| **CI/CD** | Render Blueprints | Auto-deploy on push |
| **Telemetry** | In-process spans + LLM accounting | Latency, tokens, cost tracking |

---

## ⭐ Core Features

### 1. Contract-Driven KPI Engine

7 versioned KPI semantic contracts defined in YAML with SQL templates — no ad-hoc SQL in application code:

| KPI ID | Display Name | Formula Type | Grain | Direction | Materiality |
|--------|-------------|--------------|-------|-----------|-------------|
| `revenue` | Net Revenue | SQL | Day/Week/Region/Category | Higher is better | ±5% or ±$50K |
| `units_sold` | Units Sold | SQL | Day/SKU/Region | Higher is better | ±5% or ±500 units |
| `average_selling_price` | Avg Selling Price | Derived (Revenue/Units) | Day/Category | Higher is better | ±3% or ±$2 |
| `inventory_availability` | Inventory Availability | SQL | Day/SKU/DC | Higher is better | ±3pp |
| `on_time_delivery` | On-Time Delivery % | SQL | Week/DC/Region | Higher is better | ±3pp |
| `customer_complaints` | Complaint Rate | Derived (Tickets/Units×1000) | Day/Category | Lower is better | ±10% or ±0.5/1K |
| `marketing_spend` | Marketing Spend | SQL | Week/Channel | Budget monitor | ±10% or ±$5K |

Each contract includes:
- SQL template path + dependency declaration
- Materiality thresholds (% change + absolute $)
- Freshness SLA in hours
- Data quality rules (null rate, duplicate rate)
- Lineage: source systems + transform IDs
- KPI decomposition trees (e.g., Revenue = Units × ASP)
- RBAC: allowed personas + field masking rules

### 2. Driver Attribution Strategy

| Method | Condition Used | Example |
|--------|---------------|---------|
| **Sequential Decomposition** | KPI has defined formula tree | Revenue → Volume Effect + Price/Mix Effect |
| **Pearson Correlation** | Cross-series comparison possible | Revenue vs Inventory Fill Rate |
| **OLS / Ridge Regression** | Multiple correlated drivers | Multi-driver associative ranking |
| **Granger-Style Lag Tests** | Series ≥ 30 observations | Lagged operational drivers |
| **Cross-Correlation (max lag 14d)** | Known lead/lag relationships | Inventory levels → future revenue |
| **Abstention** | Sparse product / new SKU (< 8 weeks) | No reliable attribution possible |

### 3. Confidence & Abstention System

**Weighted Confidence Fusion:**

| Component | Weight | Source |
|-----------|--------|--------|
| Data Quality | 25% | Null rates, duplicate rates, DQ checks |
| Freshness | 15% | SLA compliance per source dependency |
| Statistical Strength | 35% | Average driver confidence (p-values, r²) |
| Evidence Coverage | 25% | % of delta explained by top-3 drivers |

**Hard Abstention Rules:**

| Rule | Condition | Verdict |
|------|-----------|---------|
| R1 | History < 30 days for SKU/product | `abstain_sparse_history` |
| R2 | Top-3 drivers explain < 40% of delta | `abstain_insufficient` |
| R3 | Two hypotheses within ±5pp, opposite signs | `abstain_contradictory` |
| R4 | Critical source freshness > 2× SLA | `abstain_insufficient` |
| R5 | DQ score < 0.60 on primary source | `abstain_insufficient` |

### 4. Role-Based Access Control (RBAC)

| Persona | KPIs Visible | Action Scope | Field Masking |
|---------|-------------|--------------|---------------|
| **CFO** 💼 | All KPIs (financial focus) | Budget levers, expedite approvals, promo depth | None — full financial visibility |
| **Supply Chain Manager** 🏭 | Inventory, OTD, Units, ASP, Complaints | Fulfillment levers, DC rebalancing, carrier SLA | Marketing spend, ROI $, unit costs, margin |
| **Analyst** | All KPIs (read-only) | Feedback only; no action execution | None |
| **Admin** | Full access | Contract management, telemetry | None |

### 5. Deterministic What-If Simulation

No LLM arithmetic — every lever has a calibrated recovery coefficient in percentage points:

| Action ID | Lever | Target KPI | Recovery (pp) | Cost (USD) | Time (days) |
|-----------|-------|-----------|---------------|------------|-------------|
| `act_approve_expedite` | Expedite PO (Top 5 SKUs) | Inventory | +6.0 | $120,000 | 10 |
| `act_inv_realloc` | DC Inventory Reallocation | Inventory | +6.0 | $18,000 | 3 |
| `act_carrier_sla` | Carrier SLA + Backup | OTD % | +8.0 | $12,000 | 7 |
| `act_3pl_burst` | 3PL Overflow Activation | OTD % | +4.0 | $45,000 | 30 |
| `act_promo_depth` | Promo Optimisation | Revenue | +2.5 | $0 | 28 |
| `act_mix_optimise` | Channel Mix Shift | ASP | +1.8 | $22,000 | 21 |
| `act_cx_credit` | Customer Goodwill Credits | Complaints | -8.0 (reduce) | $30,000 | 7 |
| `act_demand_signal` | Supplier Demand Sharing | Inventory | +1.5 | $8,000 | 14 |

**Cross-KPI Elasticities Built In:**
- Inventory +1pp → Revenue +0.35pp
- OTD +1pp → Revenue +0.15pp, Complaints −0.40pp

### 6. Telemetry & Observability

In-process tracking (no external vendor required):

| Metric | Tags |
|--------|------|
| `api.request.duration_ms` | Route, status code, persona, request_id |
| `pipeline.stage.duration_ms` | Stage name, run_id, scenario |
| `llm.request.tokens` | Model, provider, signal_id |
| `llm.request.cost_usd` | Model (using live list prices) |
| `llm.validation.failures` | Failure reason code |
| `abstention.count` | Verdict type |

### 7. Feedback Learning Loop

Feedback events stored and used for:
- Driver method weight adjustments (boost decomposition when confirmed)
- "Analyst-validated" badges on confirmed drivers
- Action acceptance rate tracking per lever type

---

## 🎬 Demo Scenarios

The prototype ships with 4 curated scenarios to exercise all system behaviors:

### Scenario 1: Revenue Decline (~−8%)
**Setup:** Week 34 2026 vs. prior week — promo surge + stockout + fulfillment backlog  
**Expected Behavior:**
- Detects high-severity revenue signal (z-score ≥ 2.0)
- Explains 4–5 interacting drivers (inventory availability → units → ASP/mix → marketing efficiency)
- Grounds with SKU-level top-mover evidence, DC fill rate snapshots, support ticket spikes
- Confidence: medium-high (~0.75–0.85)
- Persona-specific narratives: CFO emphasizes financial impact; SCM emphasizes ops levers
- Actions: expedite inbound, rebalance DC inventory, adjust campaign targeting
- Simulation: improving fill rate +3pp → revenue recovery estimate

### Scenario 2: Contradictory Evidence
**Setup:** Conflicting partial signals (marketing spend ↑ but attributed channel data missing; pricing flat but promo flags ambiguous)  
**Expected Behavior:**
- Verdict: `abstain_contradictory`
- Competing hypotheses listed with support scores (51% / 49%)
- Explicit `requested_clarifications[]` returned
- Narrative uses cautious language; no single root cause
- Actions limited to "gather data" / low-risk diagnostics

### Scenario 3: Sparse History — New Product
**Setup:** SKU `NOVA-AUD-X1` launched 3 weeks ago; high visibility but minimal sales history  
**Expected Behavior:**
- Revenue/units displayed with "sparse caveat" badge
- Verdict: `abstain_sparse_history`
- Message: min 30 days required for reliable trend/causal analysis
- Actions: monitoring recommendations only; no aggressive levers

### Scenario 4: Role-Based Access
**Setup:** Same signal as Scenario 1 — switch personas between CFO and SCM  
**Expected Behavior:**
- Same `signal_id` shared across roles
- Different narrative emphasis and action lists
- SCM cannot see `marketing_spend` KPI, unit cost, or campaign ROI
- CFO sees `approval_required: true` flag on high-cost expedite actions
- Audit log records both persona views

---

## 📁 Project Structure

```
nexus-ai-master/
├── apps/
│   ├── api/                          # FastAPI Backend Application
│   │   ├── main.py                   # App entry + CORS + telemetry middleware
│   │   └── routers/
│   │       ├── health.py             # GET /health — dependency checks
│   │       ├── kpis.py               # KPI list, timeseries, observations, lineage, freshness, DQ
│   │       ├── insights.py           # Insights, evidence, actions, simulation, feedback
│   │       └── telemetry.py          # Telemetry summary endpoint
│   │
│   └── web/                          # Next.js 15 Frontend (App Router)
│       ├── app/
│       │   ├── layout.tsx            # Root layout + dashboard shell
│       │   ├── page.tsx              # Overview dashboard
│       │   ├── insights/             # Insight detail + current insight pages
│       │   ├── simulation/           # What-if simulation sandbox
│       │   ├── actions/              # Action recommendations panel
│       │   ├── feedback/             # Feedback submission + history
│       │   ├── data-quality/         # Data health + evidence strength
│       │   ├── lineage/              # Source traceability graph view
│       │   └── telemetry/            # Latency, LLM cost, abstention dashboard
│       ├── components/
│       │   ├── dashboard/            # Overview dashboard + layout components
│       │   └── ui/                   # shadcn/ui primitive components
│       └── lib/                      # API client, utilities, hooks
│
├── packages/
│   ├── analytics/                    # Core Python Analytics Engine
│   │   ├── engine.py                 # End-to-end pipeline orchestrator
│   │   ├── rbac.py                   # Persona filtering, field masking, audit log
│   │   ├── ingest/
│   │   │   └── foundation.py         # CSV loading, staging, conformed facts, DQ checks, freshness, lineage
│   │   ├── kpi/                      # KPI computation extensions
│   │   ├── detect/                   # Materiality + anomaly detection
│   │   ├── explain/                  # Driver decomposition, correlation, attribution
│   │   ├── ground/                   # Evidence retrieval + lineage enrichment
│   │   ├── confidence/               # Weighted fusion + abstention rules
│   │   ├── actions/                  # Lever library, constraint engine, decision rights
│   │   ├── simulate/
│   │   │   └── engine.py             # Deterministic what-if simulation
│   │   └── learn/                    # Feedback weights + outcome tracking
│   │
│   ├── contracts/                    # KPI Semantic Contract Registry
│   │   ├── loader.py                 # YAML parser, JSON Schema validation, SQL executor
│   │   ├── kpis/
│   │   │   ├── revenue.yaml          # 7 YAML KPI contracts (see above)
│   │   │   ├── units_sold.yaml
│   │   │   ├── average_selling_price.yaml
│   │   │   ├── inventory_availability.yaml
│   │   │   ├── on_time_delivery.yaml
│   │   │   ├── customer_complaints.yaml
│   │   │   ├── marketing_spend.yaml
│   │   │   └── sql/                  # Per-KPI SQL templates (parametrized)
│   │   └── schemas/
│   │       └── kpi_contract.json     # JSON Schema for contract validation
│   │
│   ├── db/                           # Database connectors + migrations
│   ├── llm/                          # LLM provider abstraction + structured output validation
│   └── telemetry/
│       └── __init__.py               # Span recorder, LLM accounting, cost estimation, summary
│
├── data/
│   ├── seeds/                        # NovaMart scenario seed data (CSV)
│   │   ├── sales.csv                 # 24 months × SKU × region: units, revenue, discounts
│   │   ├── inventory.csv             # 18 months × SKU × DC: on-hand, allocated, fill rate
│   │   └── support.csv               # 12 months: tickets, category, severity, resolution
│   └── scenarios/                    # Scenario config overlays (revenue_decline, etc.)
│
├── scripts/
│   ├── generate_data.py              # Seed CSV data generator
│   ├── verify_kpis.py                # KPI contract verification script
│   ├── check_routes.py               # API route availability checker
│   ├── verify_api.ps1                # PowerShell: full API smoke test
│   ├── kill_port.ps1                 # Utility: kill process on port
│   ├── setup-local.sh                # Bash: one-click local environment setup
│   └── setup-local.ps1               # PowerShell: one-click local environment setup
│
├── tests/
│   ├── unit/
│   │   ├── test_health.py            # Health endpoint test
│   │   └── test_mvp.py               # 20+ MVP smoke tests (see Testing section)
│   ├── integration/                  # Full pipeline scenario tests
│   └── golden/                       # Expected driver rankings + delta benchmarks
│
├── docs/
│   └── ARCHITECTURE.md               # Full 1000-line architecture + implementation plan
│
├── docker-compose.yml                # Local PostgreSQL 16 service
├── Dockerfile.api                    # Backend container image
├── Dockerfile.web                    # Frontend container image
├── render.yaml                       # Render Blueprint: 2 web services (API + Web)
├── pyproject.toml                    # Python project config + pytest settings
├── requirements.txt                  # Python pinned dependencies
├── .env.example                      # Environment variable template
├── start-backend.bat                 # Windows quick-start backend
├── start-frontend.bat                # Windows quick-start frontend
└── README.md                         # This file
```

---

## 🌐 API Endpoints

**Base URL:** `http://localhost:8000` (local)  
**Auth:** None in MVP (future: Supabase JWT)  
**All responses include:** `X-Request-ID` header for correlation

### KPI & Contracts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + dependency health check |
| `GET` | `/api/contracts` | List all 7 KPI semantic contracts |
| `GET` | `/api/kpis?scenario=&persona=` | List KPI observations filtered by persona |
| `GET` | `/api/kpis/{kpi_id}/timeseries?days=` | KPI time series (default 90 days) |
| `GET` | `/api/kpis/{kpi_id}/observations?scenario=` | Persisted observations + contract version hash |
| `GET` | `/api/kpis/{kpi_id}/lineage?scenario=` | DAG: Source → Staging → Transform → Fact → Contract → Observation |
| `GET` | `/api/data/freshness` | Per-source freshness lag + SLA compliance |
| `GET` | `/api/data/quality` | Data quality scores (null rate, duplicate rate) |
| `GET` | `/api/data/cadence` | Source cadence metadata (daily, hourly, weekly) |

### Insights & Evidence

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/insights?scenario=&persona=` | Insight bundle: signals, confidence, abstention |
| `GET` | `/api/insights/current?scenario=&persona=` | Full current insight (drivers, evidence, actions, narrative) |
| `GET` | `/api/insights/{insight_id}?scenario=&persona=` | Fetch specific insight by ID |
| `GET` | `/api/insights/{insight_id}/evidence` | Evidence items: top-movers, inventory snapshots, support spikes |

### Actions & Simulation

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/actions?scenario=&persona=` | Persona-filtered action recommendations |
| `POST` | `/api/simulate` | Deterministic what-if: `{ lever_adjustments[] }` → KPI impacts |
| `POST` | `/api/feedback` | Submit analyst feedback (helpful/not_helpful/incorrect + comment) |
| `GET` | `/api/feedback` | List recent feedback records (50 limit) |

### Telemetry & Admin

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/telemetry/summary` | P50/P95 latency, LLM tokens/cost, abstention counts |

---

## 🚀 Local Setup

### Prerequisites

- **Python** ≥ 3.11 (with `pip` and `venv`)
- **Node.js** ≥ 20.11 (with `npm`)
- **Git**
- **(Optional)** Docker Desktop — for PostgreSQL service

---

### Quick Start (Windows PowerShell)

```powershell
# 1. Clone + navigate
git clone https://github.com/ar041913/nexus.git
cd nexus

# 2. Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# 3. Install backend dependencies
pip install -r requirements.txt

# 4. (Optional) Start PostgreSQL via Docker Compose
docker-compose up -d postgres

# 5. Copy + fill environment variables
Copy-Item .env.example .env

# 6. Start Backend (root directory, set PYTHONPATH)
$env:PYTHONPATH = (Get-Location).Path
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
# → API running at http://127.0.0.1:8000/docs (Swagger UI)

# 7. New terminal: Start Frontend
cd apps/web
npm install
npm run dev
# → Frontend running at http://localhost:3000
```

---

### Quick Start (macOS / Linux)

```bash
# 1. Clone + navigate
git clone https://github.com/ar041913/nexus.git
cd nexus

# 2. Python venv + deps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. (Optional) PostgreSQL
docker-compose up -d postgres

# 4. Env vars
cp .env.example .env

# 5. Backend
export PYTHONPATH=$(pwd)
uvicorn apps.api.main:app --host 127.0.0.1 --port 8000

# 6. New terminal: Frontend
cd apps/web
npm install
npm run dev
```

---

### Environment Variables (`.env`)

```ini
# PostgreSQL (optional; MVP uses DuckDB file for everything)
DATABASE_URL=postgresql://nexus:nexus_dev_password@localhost:5432/nexus
POSTGRES_USER=nexus
POSTGRES_PASSWORD=nexus_dev_password
POSTGRES_DB=nexus

# LLM Provider (optional; system falls back to deterministic template narrative)
LLM_API_KEY=sk-your-openai-key
LLM_MODEL=gpt-4o-mini

# Frontend → Backend URL
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## 🐳 Docker Deployment

### Full Stack via Docker Compose + Build

```bash
# Build backend image
docker build -f Dockerfile.api -t nexus-api .

# Build frontend image
docker build -f Dockerfile.web -t nexus-web .

# Run PostgreSQL + backend
docker-compose up -d postgres
docker run -p 8000:8000 --env-file .env nexus-api

# Run frontend
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000 nexus-web
```

### Render Blueprints (Zero-Config PaaS)

The repository includes `render.yaml` — connect to your Render account and the blueprint will automatically:

1. **Create `nexus-api` (Python runtime):**
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn apps.api.main:app --host 0.0.0.0 --port $PORT`
   - Set `PYTHON_VERSION=3.11.0`

2. **Create `nexus-web` (Node runtime, rootDir: `apps/web`):**
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Set `NODE_VERSION=20.11.0`

3. Post-deploy: Set `NEXT_PUBLIC_API_URL` on `nexus-web` to the `nexus-api` on-service URL.

---

## ✅ Testing

### Running the Test Suite

```bash
# From project root (venv active):
$env:PYTHONPATH = (Get-Location).Path   # PowerShell
# export PYTHONPATH=$(pwd)               # macOS/Linux

pytest tests/unit/test_mvp.py -v
```

### MVP Smoke Test Coverage (20+ Tests)

| Test | Validates |
|------|----------|
| `test_health` | `/health` returns 200 OK |
| `test_kpis_returns_seven_from_contracts` | All 7 KPI contracts present, correct default grains |
| `test_revenue_decline_is_negative` | Scenario 1 produces ~−8% revenue delta |
| `test_insight_current` | Insight returns drivers + confidence + ID |
| `test_cfo_and_scm_get_different_actions` | RBAC action differentiation works |
| `test_sparse_history_abstains` | Scenario 3 → `abstain_sparse_history` |
| `test_contradictory_abstains` | Scenario 2 → 2 competing hypotheses returned |
| `test_evidence_endpoint` | Evidence items returned for an insight |
| `test_feedback_stored` | Feedback API inserts + invalidates persona cache |
| `test_timeseries_returns_data` | Revenue timeseries ≥ 20 data points |
| `test_contracts_endpoint` | All 7 contracts in correct REQUIRED order |
| `test_scm_cannot_see_marketing_spend` | RBAC: SCM KPI list filters out marketing_spend |
| `test_role_based_access_shares_signal_id` | Same signal ID across personas; actions/narratives differ |
| `test_lineage_graph_is_connected` | Lineage DAG: 6+ nodes, 5+ edges, all 6 node types present |
| `test_freshness_has_distinct_cadences` | Source cadence metadata: daily_batch_tplus1, weekly_campaign_rollup |
| `test_simulate_applies_delta_multiplier` | Lever delta_multiplier=2.0 → doubled recovery pp |
| `test_telemetry_summary` | Latency percentiles + LLM cost counters exposed |

---

## 🔐 LLM Responsibility Boundary

### Quantitative Truth → SQL / Python (Never LLM)

| Responsibility | Technology |
|---------------|------------|
| KPI value computation | DuckDB SQL via YAML contracts |
| Deltas, % change, period-over-period | Pandas + NumPy |
| Materiality thresholds | Business rules engine |
| Anomaly detection (z-score, STL residuals) | SciPy + StatsModels |
| **Driver ranking & effect sizes** | Decomposition formulas, Pearson correlation, Ridge regression, Granger lag tests |
| Confidence scoring | Deterministic weighted fusion formula |
| Abstention decisions | Hard rule engine (5 rules) |
| Action feasibility + decision rights | Rule-based constraint solver |
| **Simulation results** | Deterministic lever model + cross-KPI elasticities |
| Lineage + freshness metadata | Ingest/reconcile stage metadata |
| RBAC + field masking | FastAPI middleware + response shaping |

### Narrative Synthesis Only → LLM (When Enabled)

| Allowed (LLM) | Forbidden (LLM) |
|--------------|-----------------|
| Summarize pre-ranked drivers in business language | Compute or invent any KPI values or deltas |
| Persona-specific framing (CFO vs SCM tone) | Invent any driver not in frozen facts payload |
| Generate clarifying questions from gaps list | Calculate p-values, CIs, contribution % |
| Map narrative sentences → `evidence_ids[]` | Override any abstention verdict |
| Parse user natural-language query intent | Fetch or join any data |

**Guardrails:**
1. Frozen facts JSON hash stored pre- and post-LLM
2. JSON schema validation on narrative output
3. Numeric cross-check: every number in narrative must string-match frozen facts
4. Retry-once on validation failure; fallback to deterministic template on second failure
5. Prompt header: "Do not compute, modify, or invent any numeric values."
6. LLM **completely skipped** when confidence verdict = abstain

---

## 🧩 Key Design Decisions

| Decision | Rationale |
|---------|-----------|
| **Modular monolith, not microservices** | Demo-scale; avoids distributed complexity; clear package boundaries enable future decomposition |
| **DuckDB (file) for analytics** | Zero-config; columnar; SQL-first; demo performance > 100× what's needed |
| **PostgreSQL (optional) for app state** | Supabase-compatible; future state persistence path (audit, feedback, users) |
| **YAML KPI contracts (not Python)** | Business-readable; versioned; SQL template decoupled from code |
| **LLM synthesis only (no arithmetic)** | Auditable, deterministic, no hallucinated numbers — the single most important demo differentiator |
| **Deterministic abstention** | System honesty > fake confidence; judges trust "we don't know" more than wrong answers |
| **Persona-aware RBAC, not multi-tenant RLS** | Sufficient for 4-role demo; simpler to test; scale path documented |
| **Recharts over D3** | React-native; fast iteration; sufficient chart primitives for MVP |
| **In-process telemetry** | No vendor lock-in; Render free tier has no APM; data always accessible |

---

## 📚 Further Documentation

| File | Contents |
|------|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 1000-line complete architecture + 6-phase implementation plan |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Full Render deployment walkthrough |
| [`DEPLOYMENT_QUICK_START.md`](DEPLOYMENT_QUICK_START.md) | 5-step Render onboarding |
| [`render.yaml`](render.yaml) | Infrastructure-as-code blueprint |
| [`packages/contracts/kpis/*.yaml`](packages/contracts/kpis/) | 7 KPI semantic contracts (full YAML + SQL) |
| [`tests/unit/test_mvp.py`](tests/unit/test_mvp.py) | 20+ MVP smoke tests with assertions |

---



<div align="center">

**NEXUS.ai** — From raw data to recommended action. Signal → Detect → Explain → Ground → Decide → Simulate → Learn.

</div>

