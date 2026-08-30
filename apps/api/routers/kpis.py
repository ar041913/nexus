"""KPI, contract, lineage, freshness, and observation endpoints."""
from fastapi import APIRouter, HTTPException, Query

from packages.analytics.engine import SCENARIOS, compute_kpis, get_conn, get_kpi_timeseries, load_data
from packages.analytics.ingest.foundation import freshness_payload, get_lineage_graph, quality_payload
from packages.analytics.rbac import filter_kpis, write_audit
from packages.contracts import get_contract, load_contracts

router = APIRouter(prefix="/api", tags=["kpis"])


def _ensure(conn):
    load_data(conn)
    return conn


@router.get("/contracts")
def list_contracts():
    return load_contracts()


@router.get("/kpis")
def list_kpis(
    scenario: str = Query("revenue_decline"),
    persona: str = Query("cfo"),
):
    cfg = SCENARIOS.get(scenario, SCENARIOS["revenue_decline"])
    conn = _ensure(get_conn())
    values = compute_kpis(
        conn, cfg["current_start"], cfg["current_end"], cfg["prior_start"], cfg["prior_end"]
    )
    write_audit(conn, persona=persona, resource="kpis", action="list", detail=scenario)
    conn.close()
    return filter_kpis(values, persona)


@router.get("/kpis/{kpi_id}/timeseries")
def kpi_timeseries(kpi_id: str, days: int = Query(90)):
    try:
        get_contract(kpi_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown KPI {kpi_id}") from exc
    return get_kpi_timeseries(kpi_id, days)


@router.get("/kpis/{kpi_id}/observations")
def kpi_observations(kpi_id: str, scenario: str = Query("revenue_decline")):
    cfg = SCENARIOS.get(scenario, SCENARIOS["revenue_decline"])
    conn = _ensure(get_conn())
    from packages.analytics.ingest.foundation import persist_observations, write_lineage

    kpis = compute_kpis(
        conn, cfg["current_start"], cfg["current_end"], cfg["prior_start"], cfg["prior_end"]
    )
    persist_observations(conn, kpis, cfg["current_start"], cfg["current_end"], cfg["prior_start"], cfg["prior_end"])
    write_lineage(conn, kpis)
    rows = conn.execute(
        "SELECT * FROM kpi_observations WHERE kpi_id = ?", [kpi_id]
    ).df()
    conn.close()
    if rows.empty:
        raise HTTPException(404, f"No observations for {kpi_id}")
    return rows.to_dict(orient="records")


@router.get("/kpis/{kpi_id}/lineage")
def kpi_lineage(kpi_id: str, scenario: str = Query("revenue_decline")):
    try:
        get_contract(kpi_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown KPI {kpi_id}") from exc
    cfg = SCENARIOS.get(scenario, SCENARIOS["revenue_decline"])
    conn = _ensure(get_conn())
    from packages.analytics.ingest.foundation import persist_observations, write_lineage

    kpis = compute_kpis(
        conn, cfg["current_start"], cfg["current_end"], cfg["prior_start"], cfg["prior_end"]
    )
    persist_observations(conn, kpis, cfg["current_start"], cfg["current_end"], cfg["prior_start"], cfg["prior_end"])
    write_lineage(conn, kpis)
    graph = get_lineage_graph(conn, kpi_id)
    conn.close()
    return graph


@router.get("/data/freshness")
def data_freshness():
    conn = _ensure(get_conn())
    payload = freshness_payload(conn)
    conn.close()
    return payload


@router.get("/data/quality")
def data_quality():
    conn = _ensure(get_conn())
    payload = quality_payload(conn)
    conn.close()
    return payload


@router.get("/data/cadence")
def data_cadence():
    from packages.analytics.ingest.foundation import SOURCE_CADENCE

    return SOURCE_CADENCE
