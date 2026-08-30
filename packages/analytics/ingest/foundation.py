"""Conformed dimensions, extra facts, lineage graph, freshness, observations."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from packages.contracts import get_contract, load_contracts, sql_template_hash

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data" / "seeds"
AS_OF = date(2026, 8, 9)  # demo "today" — sales seed ends 2026-08-07 (T+1 lag)

SOURCE_CADENCE = {
    "sales_warehouse": {
        "grain": "day",
        "cadence": "daily_batch_tplus1",
        "lag_hours": 30.0,
        "notes": "Most recent 2 days missing from seed to simulate T+1 warehouse lag.",
    },
    "inventory_system": {
        "grain": "day",
        "cadence": "hourly_snapshot_daily_rollup",
        "lag_hours": 3.0,
        "notes": "Hourly snapshots rolled up at 23:59; daily grain with 1–4h lag.",
    },
    "crm_support": {
        "grain": "day",
        "cadence": "daily_batch_06utc",
        "lag_hours": 6.0,
        "notes": "CRM export at 06:00 UTC; tickets after 23:00 may arrive late.",
    },
    "marketing_platform": {
        "grain": "week",
        "cadence": "weekly_campaign_rollup",
        "lag_hours": 48.0,
        "notes": "Ad platforms daily T+1; TV/radio +2d; KPI default grain is week.",
    },
}

SKU_DIM = [
    ("NOVA-AUD-01", "Wireless Headphones Pro", "audio", "over_ear", date(2024, 3, 1), 52.00, 149.99, True),
    ("NOVA-AUD-02", "True Wireless Earbuds", "audio", "true_wireless", date(2024, 6, 15), 28.00, 89.99, True),
    ("NOVA-MOB-01", "Nova Phone 15", "mobile", "flagship", date(2025, 9, 1), 210.00, 699.99, True),
    ("NOVA-MOB-02", "Nova Phone 15 Lite", "mobile", "lite", date(2025, 9, 1), 135.00, 449.99, False),
    ("NOVA-CPT-01", "Nova Laptop Air", "computing", "laptop", date(2025, 2, 1), 320.00, 999.99, True),
    ("NOVA-CPT-02", "Nova Tab S", "computing", "tablet", date(2024, 11, 1), 110.00, 399.99, False),
    ("NOVA-WBL-01", "Nova Watch Ultra", "wearables", "watch", date(2025, 4, 1), 88.00, 299.99, True),
    ("NOVA-WBL-02", "Nova Band 5", "wearables", "band", date(2024, 8, 1), 22.00, 79.99, False),
    ("NOVA-ACC-01", "Nova Case Bundle", "accessories", "case", date(2024, 1, 15), 7.00, 29.99, False),
    ("NOVA-ACC-02", "Nova Charging Dock", "accessories", "power", date(2024, 5, 1), 14.00, 49.99, False),
    ("NOVA-AUD-X1", "Nova Buds X1 (new)", "audio", "true_wireless", date(2026, 7, 20), 38.00, 119.99, False),
]


def _ensure_meta_tables(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dim_date (
            date_key DATE PRIMARY KEY,
            year INTEGER,
            quarter INTEGER,
            month INTEGER,
            month_name VARCHAR,
            week_of_year INTEGER,
            day_of_week INTEGER,
            day_name VARCHAR,
            is_weekend BOOLEAN
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dim_sku (
            sku VARCHAR PRIMARY KEY,
            product_name VARCHAR,
            category VARCHAR,
            sub_category VARCHAR,
            launch_date DATE,
            unit_cost_usd DOUBLE,
            list_price_usd DOUBLE,
            is_hero_sku BOOLEAN,
            is_active BOOLEAN
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dim_region (
            region VARCHAR PRIMARY KEY,
            region_label VARCHAR,
            primary_dc_id VARCHAR,
            secondary_dc_id VARCHAR,
            timezone VARCHAR,
            population_index DOUBLE
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dim_distribution_center (
            dc_id VARCHAR PRIMARY KEY,
            dc_name VARCHAR,
            region VARCHAR,
            is_active BOOLEAN,
            capacity_units INTEGER
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dim_campaign (
            campaign_id VARCHAR PRIMARY KEY,
            campaign_name VARCHAR,
            campaign_type VARCHAR,
            owning_team VARCHAR
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS source_load_log (
            load_id VARCHAR,
            source_name VARCHAR,
            file_path VARCHAR,
            rows_loaded INTEGER,
            grain VARCHAR,
            cadence VARCHAR,
            loaded_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lineage_nodes (
            node_id VARCHAR PRIMARY KEY,
            node_type VARCHAR,
            display_name VARCHAR,
            metadata_json VARCHAR,
            created_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lineage_edges (
            edge_id VARCHAR PRIMARY KEY,
            from_node_id VARCHAR,
            to_node_id VARCHAR,
            edge_type VARCHAR,
            pipeline_run_id VARCHAR,
            created_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kpi_observations (
            obs_id VARCHAR PRIMARY KEY,
            kpi_id VARCHAR,
            contract_version VARCHAR,
            contract_sql_hash VARCHAR,
            period_start DATE,
            period_end DATE,
            grain VARCHAR,
            value DOUBLE,
            unit VARCHAR,
            prior_period_start DATE,
            prior_period_end DATE,
            prior_value DOUBLE,
            delta_absolute DOUBLE,
            delta_pct DOUBLE,
            computed_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS freshness_status (
            kpi_id VARCHAR,
            source_name VARCHAR,
            grain VARCHAR,
            cadence VARCHAR,
            sla_hours DOUBLE,
            actual_lag_hours DOUBLE,
            is_within_sla BOOLEAN,
            notes VARCHAR,
            checked_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dq_check_results (
            kpi_id VARCHAR,
            rule VARCHAR,
            threshold DOUBLE,
            observed DOUBLE,
            passed BOOLEAN,
            checked_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telemetry_spans (
            span_id VARCHAR,
            span_name VARCHAR,
            duration_ms DOUBLE,
            attributes VARCHAR,
            recorded_at TIMESTAMP
        )
    """)


def populate_dimensions(conn) -> None:
    _ensure_meta_tables(conn)
    conn.execute("DELETE FROM dim_date")
    start, end = date(2026, 2, 1), date(2026, 8, 10)
    rows = []
    d = start
    while d <= end:
        rows.append((
            d,
            d.year,
            (d.month - 1) // 3 + 1,
            d.month,
            d.strftime("%B"),
            int(d.strftime("%V")),
            d.isoweekday(),
            d.strftime("%A"),
            d.isoweekday() >= 6,
        ))
        d += timedelta(days=1)
    conn.executemany("INSERT INTO dim_date VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)

    conn.execute("DELETE FROM dim_sku")
    conn.executemany(
        "INSERT INTO dim_sku VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)",
        SKU_DIM,
    )

    conn.execute("DELETE FROM dim_region")
    conn.executemany(
        "INSERT INTO dim_region VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("North", "North Region", "DC-NORTH", "DC-EAST", "America/New_York", 1.12),
            ("South", "South Region", "DC-SOUTH", "DC-EAST", "America/Chicago", 0.88),
            ("East", "East Region", "DC-EAST", "DC-NORTH", "America/New_York", 1.08),
            ("West", "West Region", "DC-WEST", "DC-SOUTH", "America/Los_Angeles", 0.92),
        ],
    )

    conn.execute("DELETE FROM dim_distribution_center")
    conn.executemany(
        "INSERT INTO dim_distribution_center VALUES (?, ?, ?, TRUE, ?)",
        [
            ("DC-NORTH", "North Fulfilment Hub", "North", 180000),
            ("DC-SOUTH", "South Fulfilment Hub", "South", 140000),
            ("DC-EAST", "East Fulfilment Hub", "East", 160000),
            ("DC-WEST", "West Fulfilment Hub", "West", 150000),
        ],
    )

    conn.execute("DELETE FROM dim_campaign")
    conn.executemany(
        "INSERT INTO dim_campaign VALUES (?, ?, ?, ?)",
        [
            ("CMP-BRAND-01", "Nova Always-On Brand", "brand", "marketing"),
            ("CMP-PERF-01", "Performance Acquisition", "performance", "marketing"),
            ("CMP-RET-01", "Retention / CRM", "retention", "marketing"),
            ("CMP-LAUNCH-X1", "Buds X1 Launch", "product_launch", "marketing"),
        ],
    )


def populate_fulfillment_and_marketing(conn) -> None:
    """OTD daily fact (from sales) + marketing daily/weekly facts with distinct cadence."""
    conn.execute("""
        CREATE OR REPLACE TABLE fact_fulfillment_daily AS
        SELECT
            s.date,
            s.region,
            s.channel,
            SUM(s.units_sold) AS shipments,
            CAST(SUM(s.units_sold) * CASE
                WHEN s.date >= DATE '2026-07-18' THEN
                    0.92 - 0.14 * (date_diff('day', DATE '2026-07-18', s.date) / 20.0)
                ELSE 0.94
            END AS INTEGER) AS on_time_shipments
        FROM fact_sales_daily s
        GROUP BY s.date, s.region, s.channel
    """)

    marketing_csv = DATA_DIR / "marketing.csv"
    if marketing_csv.exists():
        conn.execute("""
            CREATE OR REPLACE TABLE stg_marketing AS
            SELECT
                CAST(date AS DATE) AS date,
                channel,
                campaign_id,
                CAST(spend_usd AS DOUBLE) AS spend_usd,
                CAST(attributed_revenue_usd AS DOUBLE) AS attributed_revenue_usd
            FROM read_csv_auto(?)
        """, [str(marketing_csv)])
    else:
        conn.execute("""
            CREATE OR REPLACE TABLE stg_marketing AS
            SELECT
                d.date_key AS date,
                c.channel,
                'CMP-PERF-01' AS campaign_id,
                4200.0 * (1.0 + 0.08 * sin(dayofyear(d.date_key) / 20.0))
                    * CASE WHEN d.date_key >= DATE '2026-07-18' THEN 1.08 ELSE 1.0 END AS spend_usd,
                0.0 AS attributed_revenue_usd
            FROM dim_date d
            CROSS JOIN (SELECT UNNEST(['search_paid','social','display']) AS channel) c
            WHERE d.date_key BETWEEN DATE '2026-02-01' AND DATE '2026-08-05'
        """)

    conn.execute("""
        CREATE OR REPLACE TABLE fact_marketing_daily AS
        SELECT date, channel, campaign_id,
               SUM(spend_usd) AS spend_usd,
               SUM(attributed_revenue_usd) AS attributed_revenue_usd
        FROM stg_marketing
        GROUP BY date, channel, campaign_id
    """)
    conn.execute("""
        CREATE OR REPLACE TABLE fact_marketing_weekly AS
        SELECT
            date_trunc('week', date) AS week_start,
            channel,
            SUM(spend_usd) AS spend_usd,
            COUNT(DISTINCT date) AS days_in_week
        FROM fact_marketing_daily
        GROUP BY 1, 2
    """)


def write_source_load_log(conn) -> None:
    conn.execute("DELETE FROM source_load_log")
    files = [
        ("sales_warehouse", DATA_DIR / "sales.csv", "day", "daily_batch_tplus1"),
        ("inventory_system", DATA_DIR / "inventory.csv", "day", "hourly_snapshot_daily_rollup"),
        ("crm_support", DATA_DIR / "support.csv", "day", "daily_batch_06utc"),
        ("marketing_platform", DATA_DIR / "marketing.csv", "week", "weekly_campaign_rollup"),
    ]
    now = datetime.now(timezone.utc).isoformat()
    for source, path, grain, cadence in files:
        rows = 0
        if path.exists():
            rows = conn.execute(f"SELECT COUNT(*) FROM read_csv_auto('{path.as_posix()}')").fetchone()[0]
        conn.execute(
            "INSERT INTO source_load_log VALUES (?, ?, ?, ?, ?, ?, ?)",
            [hashlib.md5(source.encode()).hexdigest()[:10], source, str(path), int(rows), grain, cadence, now],
        )


def write_freshness(conn) -> None:
    conn.execute("DELETE FROM freshness_status")
    now = datetime.now(timezone.utc).isoformat()
    for contract in load_contracts():
        source = contract["lineage"]["sources"][0]
        meta = SOURCE_CADENCE[source]
        sla = float(contract["freshness_sla_hours"])
        lag = meta["lag_hours"]
        conn.execute(
            "INSERT INTO freshness_status VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                contract["id"],
                source,
                contract["grain"]["default"],
                meta["cadence"],
                sla,
                lag,
                lag <= sla,
                meta["notes"],
                now,
            ],
        )


def write_dq_checks(conn) -> None:
    conn.execute("DELETE FROM dq_check_results")
    now = datetime.now(timezone.utc).isoformat()
    sales_null = conn.execute("SELECT COUNT(*) FROM stg_sales WHERE net_revenue_usd IS NULL").fetchone()[0]
    sales_total = conn.execute("SELECT COUNT(*) FROM stg_sales").fetchone()[0] or 1
    null_rate = sales_null / sales_total
    for contract in load_contracts():
        for rule in contract.get("quality_rules", []):
            observed = null_rate if rule["rule"] == "max_null_rate" else 0.0
            conn.execute(
                "INSERT INTO dq_check_results VALUES (?, ?, ?, ?, ?, ?)",
                [contract["id"], rule["rule"], float(rule["threshold"]), observed, observed <= float(rule["threshold"]), now],
            )


def _upsert_node(conn, node_id: str, node_type: str, display_name: str, metadata: dict[str, Any], created_at: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO lineage_nodes VALUES (?, ?, ?, ?, ?)",
        [node_id, node_type, display_name, json.dumps(metadata), created_at],
    )


def write_lineage(conn, kpis: list[dict[str, Any]] | None = None) -> None:
    """Persist source → staging → transform → fact → contract → observation DAG."""
    conn.execute("DELETE FROM lineage_nodes")
    conn.execute("DELETE FROM lineage_edges")
    now = datetime.now(timezone.utc).isoformat()
    run_id = "run-phase1"

    source_defs = {
        "sales_warehouse": (
            "src:sales_warehouse:sales.csv",
            "Sales Warehouse — order lines",
            "stg:stg_sales",
            "Staging: stg_sales",
            "xfm:RECON-SALES-AGG:v1.0",
            "Reconciliation: RECON-SALES-AGG v1.0",
            "fact:fact_sales_daily",
            "Conformed: fact_sales_daily",
        ),
        "inventory_system": (
            "src:inventory_system:inventory.csv",
            "Inventory System — DC snapshots",
            "stg:stg_inventory",
            "Staging: stg_inventory",
            "xfm:RECON-INV-DEDUP:v1.0",
            "Reconciliation: RECON-INV-DEDUP v1.0",
            "fact:fact_inventory_daily",
            "Conformed: fact_inventory_daily",
        ),
        "crm_support": (
            "src:crm_support:support.csv",
            "CRM — support tickets",
            "stg:stg_support",
            "Staging: stg_support",
            "xfm:RECON-SUPPORT-AGG:v1.0",
            "Reconciliation: RECON-SUPPORT-AGG v1.0",
            "fact:fact_support_daily",
            "Conformed: fact_support_daily",
        ),
        "marketing_platform": (
            "src:marketing_platform:marketing.csv",
            "Marketing platform — campaign spend",
            "stg:stg_marketing",
            "Staging: stg_marketing",
            "xfm:RECON-MKT-AGG:v1.0",
            "Reconciliation: RECON-MKT-AGG v1.0",
            "fact:fact_marketing_daily",
            "Conformed: fact_marketing_daily",
        ),
    }

    edge_n = 0

    def add_edge(frm: str, to: str, edge_type: str) -> None:
        nonlocal edge_n
        edge_n += 1
        conn.execute(
            "INSERT INTO lineage_edges VALUES (?, ?, ?, ?, ?, ?)",
            [f"e{edge_n:04d}", frm, to, edge_type, run_id, now],
        )

    for src_id, labels in source_defs.items():
        src, src_name, stg, stg_name, xfm, xfm_name, fact, fact_name = labels
        _upsert_node(conn, src, "source", src_name, {"source": src_id}, now)
        _upsert_node(conn, stg, "staging", stg_name, {"source": src_id}, now)
        _upsert_node(conn, xfm, "transform", xfm_name, {"rule": xfm.split(":")[1]}, now)
        _upsert_node(conn, fact, "fact", fact_name, {"table": fact.split(":")[1]}, now)
        add_edge(src, stg, "loads_into")
        add_edge(stg, xfm, "transforms_into")
        add_edge(xfm, fact, "transforms_into")

    # OTD is computed from sales warehouse via a dedicated transform
    _upsert_node(conn, "xfm:RECON-OTD:v1.0", "transform", "Reconciliation: RECON-OTD v1.0", {"rule": "RECON-OTD"}, now)
    _upsert_node(conn, "fact:fact_fulfillment_daily", "fact", "Conformed: fact_fulfillment_daily", {}, now)
    add_edge("stg:stg_sales", "xfm:RECON-OTD:v1.0", "transforms_into")
    add_edge("xfm:RECON-OTD:v1.0", "fact:fact_fulfillment_daily", "transforms_into")

    kpi_values = {k["kpi_id"]: k for k in (kpis or [])}
    for contract in load_contracts():
        kpi_id = contract["id"]
        c_node = f"kpi_contract:{kpi_id}:v{contract['version']}"
        obs_id = f"OBS-{kpi_id}-current-{contract['grain']['default']}"
        _upsert_node(
            conn, c_node, "contract", f"KPI Contract: {contract['display_name']} v{contract['version']}",
            {"sql_hash": sql_template_hash(contract), "grain": contract["grain"]["default"]}, now,
        )
        meta = kpi_values.get(kpi_id, {})
        _upsert_node(
            conn, obs_id, "observation", f"{contract['display_name']} — current window",
            {"value": meta.get("current"), "delta_pct": meta.get("delta_pct")}, now,
        )
        deps = {
            "revenue": "fact:fact_sales_daily",
            "units_sold": "fact:fact_sales_daily",
            "average_selling_price": "fact:fact_sales_daily",
            "inventory_availability": "fact:fact_inventory_daily",
            "on_time_delivery": "fact:fact_fulfillment_daily",
            "customer_complaints": "fact:fact_support_daily",
            "marketing_spend": "fact:fact_marketing_daily",
        }
        add_edge(deps[kpi_id], c_node, "computes_from")
        add_edge(c_node, obs_id, "computes_from")
        if kpi_id == "average_selling_price":
            add_edge("OBS-revenue-current-day", obs_id, "derives_from")
            add_edge("OBS-units_sold-current-day", obs_id, "derives_from")
        if kpi_id == "customer_complaints":
            add_edge("fact:fact_sales_daily", c_node, "computes_from")


def persist_observations(conn, kpis: list[dict[str, Any]], current_start: str, current_end: str,
                         prior_start: str, prior_end: str) -> None:
    conn.execute("DELETE FROM kpi_observations")
    now = datetime.now(timezone.utc).isoformat()
    for kpi in kpis:
        contract = get_contract(kpi["kpi_id"])
        obs_id = f"OBS-{kpi['kpi_id']}-current-{contract['grain']['default']}"
        conn.execute(
            "INSERT INTO kpi_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                obs_id,
                kpi["kpi_id"],
                contract["version"],
                sql_template_hash(contract),
                current_start,
                current_end,
                contract["grain"]["default"],
                kpi["current"],
                kpi["unit"],
                prior_start,
                prior_end,
                kpi["prior"],
                kpi["delta"],
                kpi["delta_pct"],
                now,
            ],
        )


def get_lineage_graph(conn, kpi_id: str) -> dict[str, Any]:
    contract = get_contract(kpi_id)
    obs_id = f"OBS-{kpi_id}-current-{contract['grain']['default']}"
    nodes = conn.execute("SELECT node_id, node_type, display_name, metadata_json FROM lineage_nodes").df()
    edges = conn.execute("SELECT edge_id, from_node_id, to_node_id, edge_type FROM lineage_edges").df()

    # Walk ancestors of this observation so the API returns a connected subgraph
    wanted = {obs_id, f"kpi_contract:{kpi_id}:v{contract['version']}"}
    changed = True
    edge_records = edges.to_dict(orient="records")
    while changed:
        changed = False
        for edge in edge_records:
            if edge["to_node_id"] in wanted and edge["from_node_id"] not in wanted:
                wanted.add(edge["from_node_id"])
                changed = True

    node_out = []
    for _, row in nodes.iterrows():
        if row["node_id"] not in wanted:
            continue
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except json.JSONDecodeError:
            metadata = {}
        node_out.append({
            "node_id": row["node_id"],
            "node_type": row["node_type"],
            "display_name": row["display_name"],
            "metadata": metadata,
        })
    edge_out = [
        {"from": e["from_node_id"], "to": e["to_node_id"], "type": e["edge_type"]}
        for e in edge_records
        if e["from_node_id"] in wanted and e["to_node_id"] in wanted
    ]
    return {
        "kpi_id": kpi_id,
        "observation_id": obs_id,
        "nodes": node_out,
        "edges": edge_out,
    }


def freshness_payload(conn) -> list[dict[str, Any]]:
    return conn.execute("SELECT * FROM freshness_status").df().to_dict(orient="records")


def quality_payload(conn) -> list[dict[str, Any]]:
    return conn.execute("SELECT * FROM dq_check_results").df().to_dict(orient="records")


def build_foundation(conn, kpis: list[dict[str, Any]] | None = None,
                     current_start: str = "2026-07-28", current_end: str = "2026-08-07",
                     prior_start: str = "2026-07-01", prior_end: str = "2026-07-11") -> None:
    populate_dimensions(conn)
    populate_fulfillment_and_marketing(conn)
    write_source_load_log(conn)
    write_freshness(conn)
    write_dq_checks(conn)
    if kpis:
        persist_observations(conn, kpis, current_start, current_end, prior_start, prior_end)
    write_lineage(conn, kpis)
