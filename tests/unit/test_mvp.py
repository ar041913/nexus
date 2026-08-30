"""MVP smoke tests — runs against generated seed data."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_kpis_returns_seven_from_contracts():
    r = client.get("/api/kpis?scenario=revenue_decline&persona=cfo")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 7
    ids = {k["kpi_id"] for k in data}
    assert ids == {
        "revenue",
        "units_sold",
        "average_selling_price",
        "inventory_availability",
        "on_time_delivery",
        "customer_complaints",
        "marketing_spend",
    }
    grains = {k["kpi_id"]: k["grain"] for k in data}
    assert grains["revenue"] == "day"
    assert grains["marketing_spend"] == "week"
    assert grains["on_time_delivery"] == "week"


def test_revenue_decline_is_negative():
    r = client.get("/api/kpis?scenario=revenue_decline")
    assert r.status_code == 200
    rev = next(k for k in r.json() if k["kpi_id"] == "revenue")
    assert rev["delta_pct"] < 0, f"Expected revenue decline, got {rev['delta_pct']}"
    assert rev["delta_pct"] > -20, f"Decline too large: {rev['delta_pct']}"


def test_insight_current():
    r = client.get("/api/insights/current?scenario=revenue_decline&persona=cfo")
    assert r.status_code == 200
    data = r.json()
    assert "insight_id" in data
    assert "drivers" in data
    assert len(data["drivers"]) >= 2
    assert "confidence" in data
    assert 0 < data["confidence"]["overall"] <= 1.0


def test_cfo_and_scm_get_different_actions():
    r_cfo = client.get("/api/actions?scenario=revenue_decline&persona=cfo")
    r_scm = client.get("/api/actions?scenario=revenue_decline&persona=supply_chain_manager")
    assert r_cfo.status_code == 200
    assert r_scm.status_code == 200
    cfo_ids = {a["action_id"] for a in r_cfo.json()["actions"]}
    scm_ids = {a["action_id"] for a in r_scm.json()["actions"]}
    assert cfo_ids != scm_ids, "CFO and SCM should get different action sets"


def test_sparse_history_abstains():
    r = client.get("/api/insights/current?scenario=sparse_history&persona=cfo")
    assert r.status_code == 200
    data = r.json()
    assert data["abstention"] is not None
    assert data["abstention"]["reason"] == "abstain_sparse_history"


def test_contradictory_abstains():
    r = client.get("/api/insights/current?scenario=contradictory&persona=cfo")
    assert r.status_code == 200
    data = r.json()
    assert data["abstention"] is not None
    assert data["abstention"]["reason"] == "abstain_contradictory"
    assert len(data["abstention"]["competing_hypotheses"]) == 2


def test_evidence_endpoint():
    # get insight id first
    r = client.get("/api/insights/current?scenario=revenue_decline&persona=cfo")
    iid = r.json()["insight_id"]
    r2 = client.get(f"/api/insights/{iid}/evidence?scenario=revenue_decline&persona=cfo")
    assert r2.status_code == 200
    assert "evidence" in r2.json()
    assert len(r2.json()["evidence"]) > 0


def test_feedback_stored():
    r = client.post("/api/feedback", json={
        "insight_id": "test-id",
        "persona":    "cfo",
        "rating":     "helpful",
        "comment":    "Good insight",
        "action_taken": "act_inv_realloc",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "recorded"


def test_timeseries_returns_data():
    r = client.get("/api/kpis/revenue/timeseries?days=30")
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 20
    assert all("date" in p and "value" in p for p in data)


def test_contracts_endpoint():
    r = client.get("/api/contracts")
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert ids == [
        "revenue",
        "units_sold",
        "average_selling_price",
        "inventory_availability",
        "on_time_delivery",
        "customer_complaints",
        "marketing_spend",
    ]


def test_scm_cannot_see_marketing_spend():
    r = client.get("/api/kpis?scenario=role_based_access&persona=supply_chain_manager")
    assert r.status_code == 200
    ids = {k["kpi_id"] for k in r.json()}
    assert "marketing_spend" not in ids
    assert "inventory_availability" in ids


def test_role_based_access_shares_signal_id():
    cfo = client.get("/api/insights/current?scenario=role_based_access&persona=cfo").json()
    scm = client.get("/api/insights/current?scenario=role_based_access&persona=supply_chain_manager").json()
    assert cfo["signal_id"] == scm["signal_id"]
    cfo_ids = {a["action_id"] for a in cfo["actions"]}
    scm_ids = {a["action_id"] for a in scm["actions"]}
    assert cfo_ids != scm_ids
    assert "marketing_spend" not in {k["kpi_id"] for k in scm["kpis"]}
    assert scm.get("masked_fields")


def test_lineage_graph_is_connected():
    r = client.get("/api/kpis/revenue/lineage")
    assert r.status_code == 200
    graph = r.json()
    node_ids = {n["node_id"] for n in graph["nodes"]}
    assert len(graph["nodes"]) >= 6
    assert len(graph["edges"]) >= 5
    for edge in graph["edges"]:
        assert edge["from"] in node_ids
        assert edge["to"] in node_ids
    types = {n["node_type"] for n in graph["nodes"]}
    assert {"source", "staging", "transform", "fact", "contract", "observation"} <= types


def test_freshness_has_distinct_cadences():
    r = client.get("/api/data/freshness")
    assert r.status_code == 200
    cadences = {row["cadence"] for row in r.json()}
    assert "daily_batch_tplus1" in cadences
    assert "weekly_campaign_rollup" in cadences
    grains = {row["grain"] for row in r.json()}
    assert "day" in grains and "week" in grains


def test_simulate_applies_delta_multiplier():
    insight = client.get("/api/insights/current?scenario=revenue_decline&persona=cfo").json()
    assert insight["actions"]
    action_id = insight["actions"][0]["action_id"]
    r = client.post("/api/simulate", json={
        "scenario": "revenue_decline",
        "persona": "cfo",
        "lever_adjustments": [{"action_id": action_id, "delta_multiplier": 2.0}],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["method"] == "deterministic_delta_multiplier"
    applied = next(a for a in body["actions"] if a["action_id"] == action_id)
    assert applied["delta_multiplier"] == 2.0
    assert body["kpi_impacts"]


def test_telemetry_summary():
    client.get("/health")
    r = client.get("/api/telemetry/summary")
    assert r.status_code == 200
    data = r.json()
    assert data["request_count"] >= 1
    assert "latency_ms" in data
    assert "llm" in data
    assert "cost_usd" in data["llm"]
    assert "model_calls" in data["llm"]
