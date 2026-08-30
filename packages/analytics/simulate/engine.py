"""Deterministic what-if simulation — no LLM arithmetic."""

from __future__ import annotations

import re
from typing import Any


LEVER_KPI_MAP = {
    "act_promo_depth": {"kpi_id": "revenue", "recovery_pp": 2.5, "cost_usd": 0, "time_days": 28},
    "act_demand_signal": {"kpi_id": "inventory_availability", "recovery_pp": 1.5, "cost_usd": 8000, "time_days": 14},
    "act_approve_expedite": {"kpi_id": "inventory_availability", "recovery_pp": 6.0, "cost_usd": 120000, "time_days": 10},
    "act_inv_realloc": {"kpi_id": "inventory_availability", "recovery_pp": 6.0, "cost_usd": 18000, "time_days": 3},
    "act_3pl_burst": {"kpi_id": "on_time_delivery", "recovery_pp": 4.0, "cost_usd": 45000, "time_days": 30},
    "act_cx_credit": {"kpi_id": "customer_complaints", "recovery_pp": -8.0, "cost_usd": 30000, "time_days": 7},
    "act_carrier_sla": {"kpi_id": "on_time_delivery", "recovery_pp": 8.0, "cost_usd": 12000, "time_days": 7},
    "act_mix_optimise": {"kpi_id": "average_selling_price", "recovery_pp": 1.8, "cost_usd": 22000, "time_days": 21},
}


def _rewrite_impact(text: str, multiplier: float) -> str:
    def scale(match: re.Match[str]) -> str:
        number = float(match.group(1))
        scaled = number * multiplier
        if scaled.is_integer():
            return f"{int(scaled)}"
        return f"{scaled:.1f}"

    return re.sub(r"(?<![A-Za-z])(\d+(?:\.\d+)?)(?=%|pp|K|\b)", scale, text, count=3)


def simulate(
    insight: dict[str, Any],
    lever_adjustments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Apply a delta-multiplier to each selected action's expected impact and
    project resulting KPI movement. All math is deterministic.
    """
    adjustments = {item["action_id"]: float(item.get("delta_multiplier", 1.0)) for item in (lever_adjustments or [])}
    actions = list(insight.get("actions") or [])
    kpis = {k["kpi_id"]: dict(k) for k in insight.get("kpis") or []}

    simulated_actions = []
    kpi_effects: dict[str, float] = {}
    total_cost = 0.0
    max_days = 0

    for action in actions:
        action_id = action["action_id"]
        multiplier = adjustments.get(action_id, 1.0 if action_id in adjustments or not adjustments else 0.0)
        # If the client omitted adjustments, treat every listed action as 1.0
        if not adjustments:
            multiplier = 1.0
        elif action_id not in adjustments:
            multiplier = 0.0

        meta = LEVER_KPI_MAP.get(action_id, {"kpi_id": "revenue", "recovery_pp": 1.0, "cost_usd": 0, "time_days": 14})
        effect = meta["recovery_pp"] * multiplier
        cost = meta["cost_usd"] * (0.6 + 0.4 * multiplier) if multiplier else 0.0
        kpi_effects[meta["kpi_id"]] = kpi_effects.get(meta["kpi_id"], 0.0) + effect
        if meta["kpi_id"] == "inventory_availability":
            kpi_effects["revenue"] = kpi_effects.get("revenue", 0.0) + (effect * 0.35)
        if meta["kpi_id"] == "on_time_delivery":
            kpi_effects["revenue"] = kpi_effects.get("revenue", 0.0) + (effect * 0.15)
            kpi_effects["customer_complaints"] = kpi_effects.get("customer_complaints", 0.0) - (effect * 0.4)
        total_cost += cost
        if multiplier:
            max_days = max(max_days, meta["time_days"])

        simulated_actions.append({
            **action,
            "delta_multiplier": round(multiplier, 3),
            "baseline_impact": action.get("expected_impact"),
            "expected_impact": _rewrite_impact(action.get("expected_impact", ""), multiplier) if multiplier else "Not applied",
            "simulated_recovery_pp": round(effect, 3),
            "simulated_cost_usd": round(cost, 2),
            "applied": multiplier > 0,
        })

    kpi_impacts = []
    for kpi_id, kpi in kpis.items():
        recovery = kpi_effects.get(kpi_id, 0.0)
        direction = kpi.get("direction", "higher_is_better")
        baseline = float(kpi.get("delta_pct") or 0.0)
        if direction == "lower_is_better":
            simulated = baseline + recovery
        else:
            simulated = baseline + recovery
        kpi_impacts.append({
            "kpi_id": kpi_id,
            "name": kpi.get("name", kpi_id),
            "unit": kpi.get("unit"),
            "baseline_delta_pct": round(baseline, 2),
            "simulated_delta_pct": round(simulated, 2),
            "recovery_pp": round(recovery, 2),
        })

    return {
        "method": "deterministic_delta_multiplier",
        "assumptions": [
            "LLM is not used for simulation arithmetic.",
            "Each lever has a calibrated recovery in percentage points from the action library.",
            "Inventory fill-rate recovery also lifts revenue at 0.35x elasticity.",
            "On-time delivery recovery lifts revenue at 0.15x and reduces complaints.",
            "Cost scales with 0.6 + 0.4 × multiplier (partial fixed + variable).",
        ],
        "total_cost_usd": round(total_cost, 2),
        "time_to_effect_days": max_days,
        "actions": simulated_actions,
        "kpi_impacts": kpi_impacts,
        "insight_id": insight.get("insight_id"),
        "persona": insight.get("persona"),
        "scenario": insight.get("scenario"),
    }
