"""FastAPI application entry point for NEXUS.ai."""

import os
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from apps.api.routers import health, insights, kpis, telemetry
from packages.telemetry import record_span

app = FastAPI(
    title="NEXUS.ai API",
    description="Enterprise KPI Intelligence-to-Action Engine",
    version="0.1.0",
)

default_origins = "http://localhost:3000,http://127.0.0.1:3000,http://[::1]:3000"
allowed_origins = os.getenv("ALLOWED_ORIGINS", default_origins).split(",")
allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(kpis.router)
app.include_router(insights.router)
app.include_router(telemetry.router)


@app.middleware("http")
async def telemetry_middleware(request: Request, call_next):
    started = time.perf_counter()
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000
    record_span(
        "api.request",
        duration_ms,
        {
            "route": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "persona": request.query_params.get("persona"),
            "request_id": request_id,
        },
    )
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "NEXUS.ai API — see /health or /docs"}
