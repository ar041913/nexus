"""Role-based access, field masking, and audit logging."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from packages.contracts import load_contracts

PERSONAS = ("cfo", "supply_chain_manager", "analyst", "admin")

FINANCIAL_MASK_FIELDS = ("spend_usd", "attributed_revenue_usd", "campaign_roi_usd", "unit_cost_usd", "margin")


def allowed_kpi_ids(persona: str) -> set[str]:
    allowed: set[str] = set()
    for contract in load_contracts():
        personas = contract.get("access", {}).get("personas", [])
        if persona in ("admin", "analyst") or persona in personas:
            allowed.add(contract["id"])
        masking = contract.get("access", {}).get("field_masking", {}) or {}
        if persona in masking and contract["id"] not in personas:
            continue
    return allowed


def filter_kpis(kpis: list[dict[str, Any]], persona: str) -> list[dict[str, Any]]:
    visible = allowed_kpi_ids(persona)
    return [kpi for kpi in kpis if kpi.get("kpi_id") in visible]


def _strip_masked(obj: Any, masked: set[str]) -> Any:
    if isinstance(obj, dict):
        return {k: _strip_masked(v, masked) for k, v in obj.items() if k not in masked}
    if isinstance(obj, list):
        return [_strip_masked(item, masked) for item in obj]
    return obj


def shape_insight(insight: dict[str, Any], persona: str) -> dict[str, Any]:
    shaped = dict(insight)
    shaped["kpis"] = filter_kpis(list(insight.get("kpis") or []), persona)
    shaped["signals"] = [s for s in insight.get("signals") or [] if s.get("kpi_id") in allowed_kpi_ids(persona)]

    if persona == "supply_chain_manager":
        shaped = _strip_masked(shaped, set(FINANCIAL_MASK_FIELDS))
        shaped["masked_fields"] = list(FINANCIAL_MASK_FIELDS)
        shaped["access"] = {
            "persona": persona,
            "hidden_kpis": ["marketing_spend"],
            "note": "Campaign ROI and unit-cost fields are withheld for this role.",
        }
    else:
        shaped["access"] = {"persona": persona, "hidden_kpis": [], "note": "Full financial detail visible."}

    actions = []
    for action in list(insight.get("actions") or []):
        item = dict(action)
        if persona == "cfo" and item.get("action_id") == "act_approve_expedite":
            item["approval_required"] = True
        if persona == "supply_chain_manager" and item.get("action_id") == "act_mix_optimise":
            continue
        actions.append(item)
    shaped["actions"] = actions
    return shaped


def write_audit(conn, *, persona: str, resource: str, action: str, detail: str = "") -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            audit_id     VARCHAR PRIMARY KEY,
            persona      VARCHAR,
            resource     VARCHAR,
            action       VARCHAR,
            detail       VARCHAR,
            created_at   TIMESTAMP
        )
    """)
    conn.execute(
        "INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?)",
        [
            uuid.uuid4().hex[:16],
            persona,
            resource,
            action,
            detail,
            datetime.now(timezone.utc).isoformat(),
        ],
    )
