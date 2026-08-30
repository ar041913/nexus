<<<<<<< HEAD

=======
# NEXUS.ai

NEXUS.ai is a KPI intelligence platform that combines data, business rules, statistical analysis, and AI-generated explanations to surface meaningful operational changes and help teams act on them.

It is designed for decision-makers who need signals, evidence, and recommendations tied to business performance rather than raw dashboards alone.

## Overview

The project includes:
- Python FastAPI backend for KPI and insight APIs
- Next.js frontend dashboard
- Contract-driven KPI definitions
- Analytics engine for explanations and confidence scoring
- Data ingestion and quality checks
- Lineage-aware reporting
- Render-ready deployment configuration

## Core capabilities

- KPI monitoring and anomaly detection
- Driver and contribution analysis
- Evidence-backed explanations
- Confidence and abstention logic
- Simulation and what-if analysis
- Data quality and freshness checks
- Actionable recommendation views for business teams

## Architecture

- Backend: FastAPI, Python
- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Data layer: DuckDB + CSV seed data
- KPI contracts: YAML definitions under packages/contracts
- Analytics: Python modules under packages/analytics

## Project structure

```text
nexus-ai-master/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── analytics/
│   ├── contracts/
│   ├── db/
│   ├── llm/
│   └── telemetry/
├── data/
├── scripts/
├── tests/
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.web
├── render.yaml
├── requirements.txt
├── pyproject.toml
├── README.md
└── .env.example
```

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/ar041913/nexus.git
cd nexus
```

### 2. Create and activate a virtual environment

Windows PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

### 4. Start the backend

From the project root:

```bash
$env:PYTHONPATH = (Get-Location).Path
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
```

The API should be available at:

```text
http://127.0.0.1:8000
```

### 5. Start the frontend

Open a second terminal and run:

```bash
cd apps/web
npm install
npm run dev
```

The frontend should be available at:

```text
http://localhost:3000
```

## Environment and configuration

The project already includes configuration for local and deployable environments. For the frontend, the API URL is typically set via environment variables.

Example:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Docker

You can also run the app using Docker Compose:

```bash
docker-compose up --build
```

## Deployment

The repository includes deployment-ready config for Render in:

- [render.yaml](render.yaml)
- [Dockerfile.api](Dockerfile.api)
- [Dockerfile.web](Dockerfile.web)

### Render quick steps

1. Create a new Render Web Service for the backend.
2. Connect the GitHub repository.
3. Use the project root for the Python service.
4. Set the start command:

```bash
uvicorn apps.api.main:app --host 0.0.0.0 --port 10000
```

5. Create a second service for the frontend under `apps/web`.
6. Set the frontend build and run commands accordingly.
7. Configure `NEXT_PUBLIC_API_URL` to the backend URL.

## API notes

The backend exposes KPI and insight routes used by the dashboard. The app is designed to serve structured analytics, not just static charts.

## License

This project is provided as-is for internal or personal use unless another license is explicitly added.

## Notes

This README intentionally focuses on setup, usage, and deployment without contributor attribution.
>>>>>>> 03ff51f (Fix frontend API config for Render deployment)
