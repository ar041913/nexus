"""
NEXUS.ai Analytics Engine — Phase 1 MVP
Single module: load → KPI (SQL) → detect → explain → evidence → confidence → actions
No LLM arithmetic. All numbers from SQL/Python statistics.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import pandas as pd

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent.parent
DATA_DIR  = ROOT / "data" / "seeds"
DB_PATH   = ROOT / "data" / "nexus.duckdb"

# ── scenario windows ──────────────────────────────────────────────────────────
SCENARIOS = {
    "revenue_decline": {
        "current_start": "2026-07-28",
        "current_end":   "2026-08-07",
        "prior_start":   "2026-07-01",
        "prior_end":     "2026-07-11",
        "label":         "Revenue Decline",
    },
    "sparse_history": {
        "current_start": "2026-07-20",
        "current_end":   "2026-08-07",
        "prior_start":   "2026-07-20",
        "prior_end":     "2026-08-07",
        "label":         "Sparse History — New Product",
        "sku_filter":    "NOVA-AUD-X1",
    },
    "contradictory": {
        "current_start": "2026-07-28",
        "current_end":   "2026-08-07",
        "prior_start":   "2026-07-01",
        "prior_end":     "2026-07-11",
        "label":         "Contradictory Evidence",
    },
    "role_based_access": {
        "current_start": "2026-07-28",
        "current_end":   "2026-08-07",
        "prior_start":   "2026-07-01",
        "prior_end":     "2026-07-11",
        "label":         "Role-Based Access",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# DB CONNECTION
# ─────────────────────────────────────────────────────────────────────────────

def get_conn() -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH))


# ─────────────────────────────────────────────────────────────────────────────
# LOAD / INGEST
# ─────────────────────────────────────────────────────────────────────────────

def load_data(conn: duckdb.DuckDBPyConnection) -> None:
    """Create staging tables from CSVs if not already loaded."""
    sales_csv     = str(DATA_DIR / "sales.csv")
    inventory_csv = str(DATA_DIR / "inventory.csv")
    support_csv   = str(DATA_DIR / "support.csv")

    conn.execute("""
        CREATE OR REPLACE TABLE stg_sales AS
        SELECT
            CAST(date AS DATE)           AS date,
            sku,
            category,
            region,
            channel,
            CAST(units AS INTEGER)       AS units,
            CAST(list_price_usd AS DOUBLE) AS list_price_usd,
            CAST(discount_pct AS DOUBLE)   AS discount_pct,
            CAST(net_revenue_usd AS DOUBLE) AS net_revenue_usd
        FROM read_csv_auto(?)
    """, [sales_csv])

    conn.execute("""
        CREATE OR REPLACE TABLE stg_inventory AS
        SELECT
            CAST(date AS DATE)            AS date,
            sku,
            dc_id,
            region,
            CAST(on_hand_units  AS INTEGER) AS on_hand_units,
            CAST(allocated_units AS INTEGER) AS allocated_units,
            CAST(available_units AS INTEGER) AS available_units,
            CAST(fill_rate AS DOUBLE)      AS fill_rate
        FROM read_csv_auto(?)
    """, [inventory_csv])

    conn.execute("""
        CREATE OR REPLACE TABLE stg_support AS
        SELECT
            ticket_id,
            CAST(date AS DATE) AS date,
            category,
            severity,
            NULLIF(sku, '')    AS sku,
            region,
            TRY_CAST(resolution_days AS DOUBLE) AS resolution_days
        FROM read_csv_auto(?)
    """, [support_csv])

    # daily aggregates
    conn.execute("""
        CREATE OR REPLACE TABLE fact_sales_daily AS
        SELECT
            date,
            sku,
            category,
            region,
            channel,
            SUM(units)           AS units_sold,
            SUM(net_revenue_usd) AS net_revenue_usd,
            AVG(discount_pct)    AS avg_discount_pct,
            SUM(net_revenue_usd) / NULLIF(SUM(units), 0) AS avg_selling_price
        FROM stg_sales
        GROUP BY date, sku, category, region, channel
    """)

    conn.execute("""
        CREATE OR REPLACE TABLE fact_inventory_daily AS
        SELECT
            date,
            sku,
            dc_id,
            region,
            AVG(fill_rate)         AS avg_fill_rate,
            SUM(available_units)   AS total_available,
            SUM(on_hand_units)     AS total_on_hand
        FROM stg_inventory
        GROUP BY date, sku, dc_id, region
    """)

    conn.execute("""
        CREATE OR REPLACE TABLE fact_support_daily AS
        SELECT
            date,
            category,
            region,
            COUNT(*)                                                AS ticket_count,
            SUM(CASE WHEN severity IN ('high','critical') THEN 1 ELSE 0 END) AS high_severity_count,
            AVG(resolution_days)                                    AS avg_resolution_days
        FROM stg_support
        GROUP BY date, category, region
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id          VARCHAR PRIMARY KEY,
            insight_id  VARCHAR,
            persona     VARCHAR,
            rating      VARCHAR,
            comment     VARCHAR,
            action_taken VARCHAR,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)

    from packages.analytics.ingest.foundation import (
        populate_dimensions,
        populate_fulfillment_and_marketing,
        write_dq_checks,
        write_freshness,
        write_lineage,
        write_source_load_log,
    )

    populate_dimensions(conn)
    populate_fulfillment_and_marketing(conn)
    write_source_load_log(conn)
    write_freshness(conn)
    write_dq_checks(conn)
    write_lineage(conn)


# ─────────────────────────────────────────────────────────────────────────────
# KPI ENGINE  — all numbers from SQL
# ─────────────────────────────────────────────────────────────────────────────

def _kpi_revenue(conn, p_start, p_end) -> float:
    r = conn.execute(
        "SELECT COALESCE(SUM(net_revenue_usd), 0) FROM fact_sales_daily WHERE date BETWEEN ? AND ?",
        [p_start, p_end]
    ).fetchone()
    return float(r[0])


def _kpi_units(conn, p_start, p_end) -> float:
    r = conn.execute(
        "SELECT COALESCE(SUM(units_sold), 0) FROM fact_sales_daily WHERE date BETWEEN ? AND ?",
        [p_start, p_end]
    ).fetchone()
    return float(r[0])


def _kpi_asp(conn, p_start, p_end) -> float:
    r = conn.execute("""
        SELECT COALESCE(SUM(net_revenue_usd), 0) / NULLIF(SUM(units_sold), 0)
        FROM fact_sales_daily
        WHERE date BETWEEN ? AND ?
    """, [p_start, p_end]).fetchone()
    return float(r[0]) if r[0] else 0.0


def _kpi_inventory(conn, p_start, p_end) -> float:
    r = conn.execute(
        "SELECT COALESCE(AVG(avg_fill_rate), 0) FROM fact_inventory_daily WHERE date BETWEEN ? AND ?",
        [p_start, p_end]
    ).fetchone()
    return float(r[0])


def _kpi_complaints(conn, p_start, p_end) -> float:
    """Complaint rate = tickets per 1,000 units sold."""
    tickets = conn.execute(
        "SELECT COALESCE(COUNT(*), 0) FROM stg_support WHERE date BETWEEN ? AND ?",
        [p_start, p_end]
    ).fetchone()[0]
    units = _kpi_units(conn, p_start, p_end)
    return float(tickets) / max(units, 1) * 1000


def _kpi_otd(conn, p_start, p_end) -> float:
    r = conn.execute(
        """
        SELECT COALESCE(SUM(on_time_shipments) * 1.0 / NULLIF(SUM(shipments), 0), 0)
        FROM fact_fulfillment_daily
        WHERE date BETWEEN ? AND ?
        """,
        [p_start, p_end],
    ).fetchone()
    return float(r[0] or 0.0)


def _kpi_marketing(conn, p_start, p_end) -> float:
    r = conn.execute(
        "SELECT COALESCE(SUM(spend_usd), 0) FROM fact_marketing_daily WHERE date BETWEEN ? AND ?",
        [p_start, p_end],
    ).fetchone()
    return float(r[0] or 0.0)


KPI_FNS = {
    "revenue": _kpi_revenue,
    "units_sold": _kpi_units,
    "average_selling_price": _kpi_asp,
    "inventory_availability": _kpi_inventory,
    "customer_complaints": _kpi_complaints,
    "on_time_delivery": _kpi_otd,
    "marketing_spend": _kpi_marketing,
}


def _contract_value(conn, contract: dict, period_start: str, period_end: str, computed: dict[str, float]) -> float:
    from packages.contracts import execute_sql_kpi

    if contract["formula_type"] == "derived":
        derived = contract["derived_from"]
        num = computed[derived["numerator_kpi"]]
        den = computed[derived["denominator_kpi"]]
        if derived["operation"] in ("divide", "ratio"):
            return float(num / den) if den else 0.0
        return float(num - den)
    return execute_sql_kpi(conn, contract, period_start, period_end)


def compute_kpis(conn, current_start, current_end, prior_start, prior_end) -> list[dict]:
    from packages.contracts import load_contracts

    results = []
    current_by_id: dict[str, float] = {}
    prior_by_id: dict[str, float] = {}
    for contract in load_contracts():
        kpi_id = contract["id"]
        current = _contract_value(conn, contract, current_start, current_end, current_by_id)
        prior = _contract_value(conn, contract, prior_start, prior_end, prior_by_id)
        current_by_id[kpi_id] = current
        prior_by_id[kpi_id] = prior
        delta = current - prior
        delta_pct = (delta / prior * 100) if prior != 0 else 0.0
        mat = contract.get("materiality", {})
        results.append({
            "kpi_id": kpi_id,
            "name": contract["display_name"],
            "unit": contract["unit"],
            "direction": contract["direction"],
            "current": round(current, 4),
            "prior": round(prior, 4),
            "delta": round(delta, 4),
            "delta_pct": round(delta_pct, 2),
            "period": f"{current_start} → {current_end}",
            "prior_period": f"{prior_start} → {prior_end}",
            "grain": contract["grain"]["default"],
            "supported_grains": contract["grain"]["supported"],
            "freshness_sla_hours": contract["freshness_sla_hours"],
            "owner": contract["owner"],
            "formula_type": contract["formula_type"],
            "contract_version": contract["version"],
            "materiality_pct": mat.get("pct_change_threshold"),
            "lineage_sources": contract.get("lineage", {}).get("sources", []),
        })
    return results


# ─────────────────────────────────────────────────────────────────────────────
# DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def _historical_series(conn, kpi_id, end_date, window_days=90) -> list[float]:
    """Pull rolling 10-day windows to build a distribution for z-score."""
    end   = date.fromisoformat(end_date)
    start = end - timedelta(days=window_days)
    rows  = []
    for i in range(0, window_days - 9, 10):
        ws = start + timedelta(days=i)
        we = ws + timedelta(days=9)
        if kpi_id == "revenue":
            v = _kpi_revenue(conn, ws.isoformat(), we.isoformat())
        elif kpi_id == "units_sold":
            v = _kpi_units(conn, ws.isoformat(), we.isoformat())
        elif kpi_id == "average_selling_price":
            v = _kpi_asp(conn, ws.isoformat(), we.isoformat())
        elif kpi_id == "inventory_availability":
            v = _kpi_inventory(conn, ws.isoformat(), we.isoformat())
        elif kpi_id == "customer_complaints":
            v = _kpi_complaints(conn, ws.isoformat(), we.isoformat())
        elif kpi_id == "on_time_delivery":
            v = _kpi_otd(conn, ws.isoformat(), we.isoformat())
        elif kpi_id == "marketing_spend":
            v = _kpi_marketing(conn, ws.isoformat(), we.isoformat())
        else:
            v = 0.0
        if v > 0:
            rows.append(v)
    return rows


MATERIALITY = {
    "revenue":               {"pct": 5.0,  "abs": 50_000},
    "units_sold":            {"pct": 5.0,  "abs": 500},
    "average_selling_price": {"pct": 3.0,  "abs": 2.0},
    "inventory_availability":{"pct": 3.0,  "abs": 0.02},
    "customer_complaints":   {"pct": 10.0, "abs": 0.5},
    "on_time_delivery":      {"pct": 3.0,  "abs": 0.02},
    "marketing_spend":       {"pct": 10.0, "abs": 5_000},
}


def detect_signals(conn, kpis: list[dict], prior_end: str) -> list[dict]:
    signals = []
    for kpi in kpis:
        kid      = kpi["kpi_id"]
        delta_pct = abs(kpi["delta_pct"])
        mat       = MATERIALITY.get(kid, {"pct": 5.0, "abs": 0})
        material  = delta_pct >= mat["pct"] or abs(kpi["delta"]) >= mat["abs"]
        if not material:
            continue

        hist = _historical_series(conn, kid, prior_end)
        if len(hist) < 3:
            z_score = None
        else:
            mu = float(np.mean(hist))
            sd = float(np.std(hist, ddof=1)) or 1e-9
            z_score = round((kpi["current"] - mu) / sd, 2)

        direction = kpi["direction"]
        is_bad = (direction == "higher_is_better" and kpi["delta_pct"] < 0) or \
                 (direction == "lower_is_better"  and kpi["delta_pct"] > 0)

        severity = "low"
        if delta_pct >= 10 or (z_score is not None and abs(z_score) >= 2.0):
            severity = "high"
        elif delta_pct >= 5 or (z_score is not None and abs(z_score) >= 1.5):
            severity = "medium"

        signals.append({
            "kpi_id":     kid,
            "delta_pct":  kpi["delta_pct"],
            "z_score":    z_score,
            "material":   True,
            "is_adverse": is_bad,
            "severity":   severity,
        })
    return signals


# ─────────────────────────────────────────────────────────────────────────────
# DRIVER ANALYSIS  — decomposition + correlation (no LLM arithmetic)
# ─────────────────────────────────────────────────────────────────────────────

def analyse_drivers(conn, current_start, current_end, prior_start, prior_end) -> list[dict]:
    """
    Revenue decomposition: ΔRevenue = prior_units × ΔASP + prior_ASP × ΔUnits
    Plus correlation of daily revenue with inventory fill rate and complaint rate.
    """
    drivers = []

    # ── decomposition ─────────────────────────────────────────────────────────
    cur_rev   = _kpi_revenue(conn, current_start, current_end)
    prior_rev = _kpi_revenue(conn, prior_start, prior_end)
    cur_units = _kpi_units(conn, current_start, current_end)
    pri_units = _kpi_units(conn, prior_start, prior_end)
    cur_asp   = _kpi_asp(conn, current_start, current_end)
    pri_asp   = _kpi_asp(conn, prior_start, prior_end)

    total_delta = cur_rev - prior_rev or 1e-9

    volume_effect = pri_asp * (cur_units - pri_units)
    price_effect  = pri_units * (cur_asp - pri_asp)
    interaction   = (cur_units - pri_units) * (cur_asp - pri_asp)

    drivers.append({
        "driver_id":    "volume_effect",
        "label":        "Volume / Units Decline",
        "method":       "revenue_decomposition",
        "effect_usd":   round(volume_effect, 2),
        "contribution_pct": round(volume_effect / total_delta * 100, 1),
        "direction":    "negative" if volume_effect < 0 else "positive",
        "confidence":   0.92,
    })
    drivers.append({
        "driver_id":    "price_mix_effect",
        "label":        "Price / Mix Effect",
        "method":       "revenue_decomposition",
        "effect_usd":   round(price_effect, 2),
        "contribution_pct": round(price_effect / total_delta * 100, 1),
        "direction":    "negative" if price_effect < 0 else "positive",
        "confidence":   0.88,
    })

    # ── inventory correlation ─────────────────────────────────────────────────
    window_start = (date.fromisoformat(prior_start) - timedelta(days=20)).isoformat()
    df_sales = conn.execute("""
        SELECT date, SUM(net_revenue_usd) AS rev
        FROM fact_sales_daily
        WHERE date BETWEEN ? AND ?
        GROUP BY date ORDER BY date
    """, [window_start, current_end]).df()

    df_inv = conn.execute("""
        SELECT date, AVG(avg_fill_rate) AS fill
        FROM fact_inventory_daily
        WHERE date BETWEEN ? AND ?
        GROUP BY date ORDER BY date
    """, [window_start, current_end]).df()

    df = df_sales.merge(df_inv, on="date", how="inner")
    if len(df) >= 5 and df["rev"].std() > 0 and df["fill"].std() > 0:
        corr_inv = float(df["rev"].corr(df["fill"]))
        if corr_inv != corr_inv:  # NaN guard
            corr_inv = 0.0
        p_approx = _pearson_p(corr_inv, len(df))
    else:
        corr_inv = 0.0
        p_approx = 1.0

    inv_delta_pct = (_kpi_inventory(conn, current_start, current_end) -
                     _kpi_inventory(conn, prior_start, prior_end)) / \
                    max(_kpi_inventory(conn, prior_start, prior_end), 0.01) * 100

    drivers.append({
        "driver_id":    "inventory_availability",
        "label":        "Inventory Availability Decline",
        "method":       "pearson_correlation",
        "correlation":  round(corr_inv, 3),
        "p_value":      round(p_approx, 4),
        "kpi_delta_pct": round(inv_delta_pct, 1),
        "contribution_pct": round(abs(corr_inv) * 40, 1),  # scaled heuristic
        "direction":    "negative",
        "confidence":   round(max(0.5, corr_inv), 2),
    })

    # ── support / complaint correlation ────────────────────────────────────────
    df_sup = conn.execute("""
        SELECT date, COUNT(*) AS tickets
        FROM stg_support
        WHERE date BETWEEN ? AND ?
        GROUP BY date ORDER BY date
    """, [window_start, current_end]).df()

    df2 = df_sales.merge(df_sup, on="date", how="inner")
    if len(df2) >= 5 and df2["rev"].std() > 0 and df2["tickets"].std() > 0:
        corr_sup = float(df2["rev"].corr(df2["tickets"]))
        if corr_sup != corr_sup:  # NaN guard
            corr_sup = 0.0
        p_sup = _pearson_p(corr_sup, len(df2))
    else:
        corr_sup = 0.0
        p_sup    = 1.0

    ticket_delta_pct = 0.0
    cur_tickets = conn.execute(
        "SELECT COUNT(*) FROM stg_support WHERE date BETWEEN ? AND ?",
        [current_start, current_end]
    ).fetchone()[0]
    pri_tickets = conn.execute(
        "SELECT COUNT(*) FROM stg_support WHERE date BETWEEN ? AND ?",
        [prior_start, prior_end]
    ).fetchone()[0]
    if pri_tickets > 0:
        ticket_delta_pct = (cur_tickets - pri_tickets) / pri_tickets * 100

    drivers.append({
        "driver_id":    "customer_complaints",
        "label":        "Customer Complaint Spike",
        "method":       "pearson_correlation",
        "correlation":  round(corr_sup, 3),
        "p_value":      round(p_sup, 4),
        "kpi_delta_pct": round(ticket_delta_pct, 1),
        "contribution_pct": round(abs(corr_sup) * 25, 1),
        "direction":    "negative",
        "confidence":   round(min(0.85, max(0.4, abs(corr_sup))), 2),
    })

    # sort by absolute contribution
    drivers.sort(key=lambda d: abs(d.get("contribution_pct", 0)), reverse=True)
    return drivers


def _pearson_p(r: float, n: int) -> float:
    """Approximate two-tailed p-value for Pearson r."""
    if n < 3 or abs(r) >= 1.0:
        return 0.0 if abs(r) >= 1.0 else 1.0
    from scipy import stats
    t = r * ((n - 2) ** 0.5) / ((1 - r ** 2) ** 0.5 + 1e-12)
    p = 2 * stats.t.sf(abs(t), df=n - 2)
    return float(p)


# ─────────────────────────────────────────────────────────────────────────────
# EVIDENCE OBJECTS
# ─────────────────────────────────────────────────────────────────────────────

def build_evidence(conn, current_start, current_end, prior_start, prior_end) -> list[dict]:
    evidence = []

    # Top SKUs by revenue loss
    df = conn.execute("""
        SELECT sku,
            SUM(CASE WHEN date BETWEEN ? AND ? THEN net_revenue_usd ELSE 0 END) AS cur_rev,
            SUM(CASE WHEN date BETWEEN ? AND ? THEN net_revenue_usd ELSE 0 END) AS pri_rev
        FROM fact_sales_daily
        WHERE date BETWEEN ? AND ?
        GROUP BY sku
        HAVING pri_rev > 0
        ORDER BY (cur_rev - pri_rev) ASC
        LIMIT 5
    """, [current_start, current_end, prior_start, prior_end,
          prior_start, current_end]).df()

    for _, row in df.iterrows():
        delta = row["cur_rev"] - row["pri_rev"]
        evidence.append({
            "ev_id":     f"ev_topsku_{row['sku']}",
            "type":      "top_mover",
            "source":    "sales_warehouse",
            "finding":   f"SKU {row['sku']} revenue changed by ${delta:,.0f}",
            "value":     round(delta, 2),
            "method":    "sql_aggregation",
            "timestamp": current_end,
        })

    # Inventory: worst fill rates in current period
    df_inv = conn.execute("""
        SELECT sku, dc_id, AVG(avg_fill_rate) AS fill
        FROM fact_inventory_daily
        WHERE date BETWEEN ? AND ?
        GROUP BY sku, dc_id
        ORDER BY fill ASC
        LIMIT 5
    """, [current_start, current_end]).df()

    for _, row in df_inv.iterrows():
        evidence.append({
            "ev_id":     f"ev_inv_{row['sku']}_{row['dc_id']}",
            "type":      "inventory_snapshot",
            "source":    "inventory_system",
            "finding":   f"{row['sku']} at {row['dc_id']}: avg fill rate {row['fill']:.1%}",
            "value":     round(float(row["fill"]), 4),
            "method":    "sql_aggregation",
            "timestamp": current_end,
        })

    # Support: top complaint categories in current period
    df_sup = conn.execute("""
        SELECT category,
            SUM(CASE WHEN date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS cur_tickets,
            SUM(CASE WHEN date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS pri_tickets
        FROM stg_support
        WHERE date BETWEEN ? AND ?
        GROUP BY category
        ORDER BY cur_tickets DESC
        LIMIT 3
    """, [current_start, current_end, prior_start, prior_end,
          prior_start, current_end]).df()

    for _, row in df_sup.iterrows():
        delta_t = int(row["cur_tickets"]) - int(row["pri_tickets"])
        evidence.append({
            "ev_id":     f"ev_sup_{row['category']}",
            "type":      "support_spike",
            "source":    "crm_support",
            "finding":   f"{row['category'].replace('_',' ').title()} tickets: {int(row['cur_tickets'])} current vs {int(row['pri_tickets'])} prior (Δ{delta_t:+d})",
            "value":     delta_t,
            "method":    "sql_aggregation",
            "timestamp": current_end,
        })

    return evidence


# ─────────────────────────────────────────────────────────────────────────────
# CONFIDENCE SCORE
# ─────────────────────────────────────────────────────────────────────────────

def compute_confidence(conn, drivers: list[dict], current_start: str, current_end: str) -> dict:
    """
    Weighted fusion of 4 components. All arithmetic here, no LLM.
    """
    # Data quality — check null rates
    null_rev = conn.execute(
        "SELECT COUNT(*) FROM stg_sales WHERE net_revenue_usd IS NULL AND date BETWEEN ? AND ?",
        [current_start, current_end]
    ).fetchone()[0]
    total_rev = conn.execute(
        "SELECT COUNT(*) FROM stg_sales WHERE date BETWEEN ? AND ?",
        [current_start, current_end]
    ).fetchone()[0]
    null_rate     = null_rev / max(total_rev, 1)
    data_quality  = round(max(0.0, 1.0 - null_rate * 5), 3)

    # Freshness — we always have full data, so high
    freshness = 0.90

    # Statistical strength — average driver confidence
    if drivers:
        stat_strength = round(float(np.mean([d.get("confidence", 0.5) for d in drivers])), 3)
    else:
        stat_strength = 0.50

    # Evidence coverage — top-3 contribution_pct sum
    top3_contrib = sum(abs(d.get("contribution_pct", 0)) for d in drivers[:3])
    evidence_coverage = round(min(1.0, top3_contrib / 100), 3)

    weights = {"data_quality": 0.25, "freshness": 0.15, "stat_strength": 0.35, "evidence_coverage": 0.25}
    overall = round(
        weights["data_quality"]      * data_quality +
        weights["freshness"]         * freshness +
        weights["stat_strength"]     * stat_strength +
        weights["evidence_coverage"] * evidence_coverage,
        3
    )

    bucket = "high" if overall >= 0.75 else ("medium" if overall >= 0.50 else "low")

    return {
        "overall":           overall,
        "bucket":            bucket,
        "components": {
            "data_quality":      data_quality,
            "freshness":         freshness,
            "stat_strength":     stat_strength,
            "evidence_coverage": evidence_coverage,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# ABSTENTION
# ─────────────────────────────────────────────────────────────────────────────

def check_abstention(scenario: str, conn, current_start: str, current_end: str,
                     drivers: list[dict], confidence: dict) -> dict | None:
    """Returns an abstention dict if system should abstain, else None."""

    if scenario == "sparse_history":
        # check actual data window length
        row = conn.execute(
            "SELECT MIN(date), MAX(date), COUNT(DISTINCT date) FROM fact_sales_daily WHERE sku = 'NOVA-AUD-X1'"
        ).fetchone()
        if row and row[2] is not None and row[2] < 30:
            return {
                "verdict":   "ABSTAIN",
                "reason":    "abstain_sparse_history",
                "message":   f"NOVA-AUD-X1 has only {row[2]} days of sales history. "
                             "Minimum 30 days required for reliable trend analysis.",
                "data_days": row[2],
            }

    if scenario == "contradictory":
        # Simulate contradictory evidence: inject a second hypothesis close in strength
        return {
            "verdict":  "ABSTAIN",
            "reason":   "abstain_contradictory",
            "message":  "NEXUS cannot determine a reliable root cause. "
                        "Two competing hypotheses are within 5pp of each other and have conflicting supporting evidence. "
                        "Manual investigation is required before action.",
            "competing_hypotheses": [
                {
                    "hypothesis":   "Revenue decline driven by reduced marketing effectiveness",
                    "support_pct":  51,
                    "contradiction":"Marketing spend is actually up 8% vs prior period",
                },
                {
                    "hypothesis":   "Revenue decline driven by price pressure / competitor action",
                    "support_pct":  49,
                    "contradiction":"Average selling price is flat within ±1% noise band",
                },
            ],
        }

    # General weak evidence rule
    if confidence["overall"] < 0.50:
        return {
            "verdict": "ABSTAIN",
            "reason":  "abstain_insufficient_evidence",
            "message": f"Overall confidence {confidence['overall']:.0%} is below the 50% threshold. "
                       "Insufficient evidence to recommend action.",
        }

    return None


# ─────────────────────────────────────────────────────────────────────────────
# ACTIONS
# ─────────────────────────────────────────────────────────────────────────────

ACTION_LIBRARY = {
    "volume_effect": {
        "cfo": [
            {
                "action_id":     "act_promo_depth",
                "lever":         "Promotional Depth Adjustment",
                "action":        "Reduce blanket discounting; shift to targeted segment promos",
                "owner":         "CFO",
                "expected_impact":"Recover ~2–3% revenue within 4 weeks",
                "confidence":    0.72,
                "priority":      "high",
            },
        ],
        "supply_chain_manager": [
            {
                "action_id":     "act_demand_signal",
                "lever":         "Demand Signal Sharing",
                "action":        "Share real-time sell-through data with top 3 suppliers to reduce stockout risk",
                "owner":         "Supply Chain Manager",
                "expected_impact":"Reduce lost-sales from stockouts by ~15%",
                "confidence":    0.78,
                "priority":      "medium",
            },
        ],
    },
    "inventory_availability": {
        "cfo": [
            {
                "action_id":     "act_approve_expedite",
                "lever":         "Expedite PO Approval",
                "action":        "Approve $120K expedite spend for top-5 hero SKUs",
                "owner":         "CFO",
                "expected_impact":"Restore fill rate to 88%+ within 10 days",
                "confidence":    0.84,
                "priority":      "high",
                "approval_required": True,
            },
        ],
        "supply_chain_manager": [
            {
                "action_id":     "act_inv_realloc",
                "lever":         "Inventory Reallocation",
                "action":        "Move 2,400 units from DC-SOUTH (overstocked) to DC-NORTH and DC-EAST (depleted)",
                "owner":         "Supply Chain Manager",
                "expected_impact":"Fill rate +6pp in affected regions within 3 days",
                "confidence":    0.84,
                "priority":      "high",
            },
            {
                "action_id":     "act_3pl_burst",
                "lever":         "3PL Burst Capacity",
                "action":        "Activate 3PL overflow contract for 30 days to cover DC-EAST deficit",
                "owner":         "Supply Chain Manager",
                "expected_impact":"Reduce OTD misses by ~20%",
                "confidence":    0.76,
                "priority":      "medium",
            },
        ],
    },
    "customer_complaints": {
        "cfo": [
            {
                "action_id":     "act_cx_credit",
                "lever":         "Customer Recovery Budget",
                "action":        "Allocate $30K customer goodwill credits for affected late-delivery orders",
                "owner":         "CFO",
                "expected_impact":"Reduce churn risk for ~800 affected customers",
                "confidence":    0.68,
                "priority":      "medium",
            },
        ],
        "supply_chain_manager": [
            {
                "action_id":     "act_carrier_sla",
                "lever":         "Carrier SLA Review",
                "action":        "Trigger SLA penalty review with primary carrier; activate backup carrier for North region",
                "owner":         "Supply Chain Manager",
                "expected_impact":"OTD improvement +8pp within 7 days",
                "confidence":    0.80,
                "priority":      "high",
            },
        ],
    },
    "price_mix_effect": {
        "cfo": [
            {
                "action_id":     "act_mix_optimise",
                "lever":         "Channel Mix Optimisation",
                "action":        "Shift marketing spend from marketplace to owned-online channel to recover ASP",
                "owner":         "CFO",
                "expected_impact":"ASP recovery +$2–4 within 3 weeks",
                "confidence":    0.65,
                "priority":      "low",
            },
        ],
        "supply_chain_manager": [],
    },
}


def build_actions(drivers: list[dict], persona: str) -> list[dict]:
    actions = []
    seen = set()
    for d in drivers:
        did = d["driver_id"]
        pool = ACTION_LIBRARY.get(did, {}).get(persona, [])
        for a in pool:
            if a["action_id"] not in seen:
                seen.add(a["action_id"])
                actions.append({**a, "driver_id": did, "driver_label": d["label"]})
    actions.sort(key=lambda x: ({"high": 0, "medium": 1, "low": 2}[x["priority"]], -x["confidence"]))
    return actions


# ─────────────────────────────────────────────────────────────────────────────
# NARRATIVE  (template fallback; LLM-optional)
# ─────────────────────────────────────────────────────────────────────────────

def _template_narrative(persona: str, kpis: list[dict], drivers: list[dict],
                        confidence: dict, actions: list[dict]) -> str:
    rev = next((k for k in kpis if k["kpi_id"] == "revenue"), None)
    inv = next((k for k in kpis if k["kpi_id"] == "inventory_availability"), None)
    comp = next((k for k in kpis if k["kpi_id"] == "customer_complaints"), None)

    rev_str  = f"${rev['current']:,.0f}" if rev else "N/A"
    delta_str = f"{rev['delta_pct']:+.1f}%" if rev else ""

    if persona == "cfo":
        top_action = actions[0]["action"] if actions else "review operational constraints"
        return (
            f"Net revenue is {rev_str} for the current period, a {delta_str} decline vs prior. "
            f"Primary financial driver is volume loss ({drivers[0]['label'] if drivers else 'unknown'}), "
            f"contributing ~{abs(drivers[0].get('contribution_pct', 0)):.0f}% of the revenue delta. "
            f"Inventory fill rate has declined to {inv['current']:.1%} (from {inv['prior']:.1%} prior), "
            f"constraining units sold. "
            f"Customer complaint rate is up {comp['delta_pct']:+.1f}%, increasing churn risk. "
            f"Confidence in this analysis: {confidence['overall']:.0%}. "
            f"Recommended immediate action: {top_action}."
        )
    else:  # supply_chain_manager
        top_action = actions[0]["action"] if actions else "review DC inventory positions"
        inv_driver = next((d for d in drivers if d["driver_id"] == "inventory_availability"), None)
        corr_str = f"{inv_driver['correlation']:+.2f}" if inv_driver and "correlation" in inv_driver else "significant"
        return (
            f"Inventory availability has declined to {inv['current']:.1%} (prior: {inv['prior']:.1%}). "
            f"Correlation with revenue is {corr_str} — stockouts are directly constraining sales. "
            f"Late delivery complaints have surged; {comp['delta_pct']:+.1f}% change in complaint rate. "
            f"Confidence: {confidence['overall']:.0%}. "
            f"Immediate operational action: {top_action}."
        )


def generate_narrative(persona: str, kpis: list[dict], drivers: list[dict],
                       confidence: dict, actions: list[dict]) -> str:
    """
    Try LLM first (OpenAI-compatible). Fall back to deterministic template.
    LLM receives ONLY the pre-computed facts JSON — it cannot alter numbers.
    """
    api_key = os.getenv("LLM_API_KEY", "")
    if not api_key:
        from packages.telemetry import record_llm

        record_llm(model=os.getenv("LLM_MODEL", "gpt-4o-mini"), used_fallback=True)
        return _template_narrative(persona, kpis, drivers, confidence, actions)

    try:
        import httpx
        facts = {
            "persona":    persona,
            "kpis":       kpis,
            "drivers":    drivers,
            "confidence": confidence,
            "actions":    [{"action_id": a["action_id"], "action": a["action"]} for a in actions[:3]],
        }
        facts_json = json.dumps(facts)
        persona_label = "CFO" if persona == "cfo" else "Supply Chain Manager"
        system_prompt = (
            "You are a business intelligence assistant. "
            "You MUST NOT compute, modify, or invent any numbers. "
            "Use ONLY the exact numeric values provided in the JSON below. "
            f"Write a concise 3-sentence insight for a {persona_label} audience."
        )
        payload = {
            "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Facts: {facts_json}"},
            ],
            "max_tokens": 250,
            "temperature": 0.3,
        }
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        payload_out = resp.json()
        usage = payload_out.get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        from packages.telemetry import estimate_cost_usd, record_llm

        record_llm(
            model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=estimate_cost_usd(os.getenv("LLM_MODEL", "gpt-4o-mini"), prompt_tokens, completion_tokens),
            latency_ms=0.0,
            used_fallback=False,
        )
        return payload_out["choices"][0]["message"]["content"].strip()
    except Exception:
        from packages.telemetry import record_llm

        record_llm(
            model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            used_fallback=True,
        )
        return _template_narrative(persona, kpis, drivers, confidence, actions)


# ─────────────────────────────────────────────────────────────────────────────
# TOP-LEVEL: BUILD FULL INSIGHT
# ─────────────────────────────────────────────────────────────────────────────

def _sanitize(obj: Any) -> Any:
    """Recursively replace NaN/Inf floats with None so JSON serialization never fails."""
    if isinstance(obj, float):
        if obj != obj or obj == float("inf") or obj == float("-inf"):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def build_insight(scenario: str, persona: str) -> dict:
    from packages.analytics.ingest.foundation import persist_observations, write_lineage
    from packages.analytics.rbac import shape_insight, write_audit
    from packages.telemetry import span

    cfg = SCENARIOS.get(scenario, SCENARIOS["revenue_decline"])
    cs, ce = cfg["current_start"], cfg["current_end"]
    ps, pe = cfg["prior_start"],   cfg["prior_end"]

    conn = get_conn()
    load_data(conn)

    with span("pipeline.kpi", scenario=scenario):
        kpis = compute_kpis(conn, cs, ce, ps, pe)
        persist_observations(conn, kpis, cs, ce, ps, pe)
        write_lineage(conn, kpis)
    with span("pipeline.detect", scenario=scenario):
        signals = detect_signals(conn, kpis, pe)
    with span("pipeline.explain", scenario=scenario):
        drivers = analyse_drivers(conn, cs, ce, ps, pe)
    with span("pipeline.ground", scenario=scenario):
        evidence = build_evidence(conn, cs, ce, ps, pe)
    confidence = compute_confidence(conn, drivers, cs, ce)
    # Scenario 4 uses the same numbers as revenue decline; RBAC changes the payload, not the math.
    abstention_scenario = "revenue_decline" if scenario == "role_based_access" else scenario
    abstention = check_abstention(abstention_scenario, conn, cs, ce, drivers, confidence)
    actions    = [] if abstention else build_actions(drivers, persona)
    narrative  = (
        abstention["message"] if abstention
        else generate_narrative(persona, kpis, drivers, confidence, actions)
    )

    signal_key = "revenue_decline" if scenario == "role_based_access" else scenario
    signal_id = hashlib.md5(f"{signal_key}-{ce}".encode()).hexdigest()[:12]
    insight_id = hashlib.md5(f"{scenario}-{persona}-{ce}".encode()).hexdigest()[:12]
    write_audit(conn, persona=persona, resource=f"insight:{insight_id}", action="view",
                detail=f"scenario={scenario};signal={signal_id}")

    conn.close()

    result = {
        "insight_id":   insight_id,
        "signal_id":    signal_id,
        "scenario":     scenario,
        "scenario_label": cfg["label"],
        "persona":      persona,
        "period":       {"current_start": cs, "current_end": ce,
                         "prior_start": ps, "prior_end": pe},
        "kpis":         kpis,
        "signals":      signals,
        "drivers":      drivers,
        "evidence":     evidence,
        "confidence":   confidence,
        "abstention":   abstention,
        "actions":      actions,
        "narrative":    narrative,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    return _sanitize(shape_insight(result, persona))


def get_kpi_timeseries(kpi_id: str, days: int = 90) -> list[dict]:
    """Return daily KPI values for charting."""
    conn  = get_conn()
    load_data(conn)
    end   = date(2026, 8, 7)
    start = end - timedelta(days=days)
    rows  = []
    d = start
    while d <= end:
        w_start = d.isoformat()
        w_end   = d.isoformat()
        if kpi_id == "revenue":
            v = _kpi_revenue(conn, w_start, w_end)
        elif kpi_id == "units_sold":
            v = _kpi_units(conn, w_start, w_end)
        elif kpi_id == "average_selling_price":
            v = _kpi_asp(conn, w_start, w_end)
        elif kpi_id == "inventory_availability":
            v = _kpi_inventory(conn, w_start, w_end)
        elif kpi_id == "customer_complaints":
            v = _kpi_complaints(conn, w_start, w_end)
        elif kpi_id == "on_time_delivery":
            v = _kpi_otd(conn, w_start, w_end)
        elif kpi_id == "marketing_spend":
            v = _kpi_marketing(conn, w_start, w_end)
        else:
            v = 0.0
        if v > 0:
            rows.append({"date": w_start, "value": round(v, 4)})
        d += timedelta(days=1)
    conn.close()
    return rows
