"""Insights, evidence, actions, feedback endpoints."""
from __future__ import annotations

import hashlib
import uuid
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from packages.analytics.engine import build_insight, get_conn, load_data

router = APIRouter(prefix="/api", tags=["insights"])

# In-memory insight cache to avoid re-computing on every request
_cache: dict[str, dict] = {}


def _cache_key(scenario: str, persona: str) -> str:
    return f"{scenario}:{persona}"


def _get_or_build(scenario: str, persona: str) -> dict:
    key = _cache_key(scenario, persona)
    if key not in _cache:
        _cache[key] = build_insight(scenario, persona)
    return _cache[key]


@router.get("/insights")
def list_insights(
    scenario: str = Query("revenue_decline"),
    persona:  str = Query("cfo"),
):
    insight = _get_or_build(scenario, persona)
    return {
        "scenario":       insight["scenario"],
        "scenario_label": insight["scenario_label"],
        "persona":        insight["persona"],
        "insight_id":     insight["insight_id"],
        "signals":        insight["signals"],
        "confidence":     insight["confidence"],
        "abstention":     insight["abstention"],
        "generated_at":   insight["generated_at"],
    }


@router.get("/insights/current")
def get_current_insight(
    scenario: str = Query("revenue_decline"),
    persona:  str = Query("cfo"),
):
    return _get_or_build(scenario, persona)


@router.get("/insights/{insight_id}")
def get_insight(
    insight_id: str,
    scenario: str = Query("revenue_decline"),
    persona:  str = Query("cfo"),
):
    insight = _get_or_build(scenario, persona)
    if insight["insight_id"] != insight_id:
        # rebuild — id changed due to different scenario/persona
        insight = _get_or_build(scenario, persona)
    return insight


@router.get("/insights/{insight_id}/evidence")
def get_evidence(
    insight_id: str,
    scenario: str = Query("revenue_decline"),
    persona:  str = Query("cfo"),
):
    insight = _get_or_build(scenario, persona)
    return {"insight_id": insight["insight_id"], "evidence": insight["evidence"]}


@router.get("/actions")
def list_actions(
    scenario: str = Query("revenue_decline"),
    persona:  str = Query("cfo"),
):
    insight = _get_or_build(scenario, persona)
    return {
        "scenario":   insight["scenario"],
        "persona":    insight["persona"],
        "signal_id":  insight.get("signal_id"),
        "abstention": insight["abstention"],
        "actions":    insight["actions"],
        "access":     insight.get("access"),
    }


class LeverAdjustment(BaseModel):
    action_id: str
    delta_multiplier: float = 1.0


class SimulateIn(BaseModel):
    scenario: str = "revenue_decline"
    persona: str = "cfo"
    lever_adjustments: list[LeverAdjustment] = []


@router.post("/simulate")
def simulate_actions(body: SimulateIn):
    """Deterministic what-if: apply a delta-multiplier to each lever's expected impact."""
    from packages.analytics.simulate import simulate
    from packages.telemetry import span

    insight = _get_or_build(body.scenario, body.persona)
    adjustments = [item.model_dump() for item in body.lever_adjustments]
    with span("pipeline.simulate", scenario=body.scenario, persona=body.persona):
        result = simulate(insight, adjustments)
    return result


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackIn(BaseModel):
    insight_id:   str
    persona:      str
    rating:       str        # "helpful" | "not_helpful" | "incorrect"
    comment:      str = ""
    action_taken: str = ""


@router.post("/feedback")
def submit_feedback(body: FeedbackIn):
    conn = get_conn()
    load_data(conn)
    fid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO feedback (id, insight_id, persona, rating, comment, action_taken) VALUES (?,?,?,?,?,?)",
        [fid, body.insight_id, body.persona, body.rating, body.comment, body.action_taken]
    )
    conn.close()
    # Invalidate cache so next call reflects any learning
    for key in list(_cache.keys()):
        if body.persona in key:
            del _cache[key]
    return {"feedback_id": fid, "status": "recorded"}


@router.get("/feedback")
def list_feedback():
    conn = get_conn()
    load_data(conn)
    rows = conn.execute("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50").df()
    conn.close()
    return rows.to_dict(orient="records")
