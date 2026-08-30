# NEXUS.ai API

FastAPI application layer for the NEXUS.ai modular monolith.

## Responsibilities

- REST API endpoints
- Request routing and middleware (CORS, future auth/RBAC)
- Pipeline orchestration hooks (future phases)
- Thin controllers — business logic lives in `packages/analytics`

## Run locally

From the repository root (with virtual environment activated):

```bash
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: http://localhost:8000/health
