"""Runtime telemetry: latency, LLM calls, tokens, cost."""
from fastapi import APIRouter

from packages.analytics.engine import get_conn, load_data
from packages.telemetry import summary

router = APIRouter(prefix="/api", tags=["telemetry"])


@router.get("/telemetry/summary")
def telemetry_summary():
    payload = summary()
    conn = get_conn()
    load_data(conn)
    try:
        audit = conn.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 25"
        ).df().to_dict(orient="records")
    except Exception:
        audit = []
    conn.close()
    payload["audit"] = audit
    return payload
