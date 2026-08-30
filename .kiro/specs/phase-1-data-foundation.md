# NEXUS.ai — Phase 1 Specification: Data Foundation

**Status:** Draft for review  
**Phase:** 1 of 7  
**Depends on:** Phase 0 complete (`GET /health` returns OK — ✓)  
**Out of scope for this phase:** anomaly detection, driver analysis, causal inference, LLM, narratives, recommendations, simulation, authentication, RBAC, feedback learning

---

## A. Requirements

### A.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| F-01 | The system must generate synthetic NovaMart datasets for all four source systems covering their specified historical windows. |
| F-02 | Each source dataset must be loadable into DuckDB staging tables via a deterministic ingest module. |
| F-03 | The ingest module must record a `source_load_log` entry for every file loaded, capturing row counts, file hash, and load timestamp. |
| F-04 | Every staging table must carry per-row data quality flags: `dq_is_null_critical`, `dq_is_duplicate`, `dq_is_late_arrival`, `dq_is_imputed`, `dq_is_out_of_range`. |
| F-05 | A reconciliation module must produce conformed fact tables from the staging tables according to the defined reconciliation rules. |
| F-06 | A `reconciliation_run` record must be written for each source after every reconciliation pass, capturing match rate, orphan row counts, freshness lag, and aggregate DQ score. |
| F-07 | Five conformed fact tables and four conformed dimension tables must be populated and queryable in DuckDB after a full ingest + reconcile pass. |
| F-08 | Seven KPI semantic contracts must exist as YAML files, each with a paired SQL template that executes correctly against the conformed facts. |
| F-09 | A KPI engine module must execute all contracts and write results to `kpi_observations` in DuckDB. |
| F-10 | A freshness tracker must evaluate each KPI's `freshness_sla_hours` against the actual source lag and write a `freshness_status` record. |
| F-11 | A data quality checker must evaluate each conformed fact table against per-contract quality rules and write a `dq_check_results` record. |
| F-12 | A lineage writer must record a three-node lineage chain (source → transform → KPI) for every `kpi_observation` produced. |
| F-13 | The pipeline must be executable from the CLI via `python scripts/seed_db.py && python scripts/run_pipeline.py --phase 1`. |
| F-14 | Phase 1 API endpoints (`GET /api/v1/kpis`, `GET /api/v1/kpis/{id}/observations`, `GET /api/v1/kpis/{id}/lineage`, `GET /api/v1/data/freshness`, `GET /api/v1/data/quality`) must return correct data sourced exclusively from DuckDB. |

### A.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF-01 | Full ingest + reconcile + KPI compute pass must complete in under 30 seconds on a developer laptop against baseline seed data. |
| NF-02 | All numeric KPI values must be produced by SQL or deterministic Python only. No estimated, interpolated, or LLM-generated values may appear in `kpi_observations`. |
| NF-03 | All seed data must be generated with a fixed random seed so results are reproducible across machines. |
| NF-04 | DuckDB database file must be excluded from git (already in `.gitignore`). Seed CSVs must be committed. |
| NF-05 | Every SQL template must be idempotent: re-running `CREATE OR REPLACE` / `INSERT OR REPLACE` must not produce duplicate observations. |
| NF-06 | The DuckDB schema must be versioned via a migration runner so future phases can apply incremental DDL changes. |
| NF-07 | No data from one source must silently overwrite another during reconciliation; conflicts must be flagged and the winning row recorded with its resolution rule. |

### A.3 Constraints

- Python ≥ 3.11; all dependencies already declared in `pyproject.toml`.
- DuckDB ≥ 1.1.0 (in-process; single `.db` file at `data/nexus.duckdb`).
- Seed files are CSV (gzip-optional); no external database required to generate them.
- KPI contract YAML files live under `packages/contracts/kpis/`; SQL templates under `packages/contracts/kpis/sql/`.
- No new third-party Python packages may be added in Phase 1 beyond what is already in `pyproject.toml`.

---

## B. Data Architecture

### B.1 Storage Layout

```
DuckDB  (data/nexus.duckdb)
│
├── schema: raw          ← exact mirrors of source files; never mutated after load
│   ├── stg_sales_order_lines
│   ├── stg_inventory_snapshots
│   ├── stg_support_tickets
│   ├── stg_marketing_spend
│   └── stg_external_events
│
├── schema: conformed    ← reconciled, grain-aligned, DQ-flagged
│   ├── dim_date
│   ├── dim_sku
│   ├── dim_region
│   ├── dim_distribution_center
│   ├── fact_sales_daily
│   ├── fact_inventory_daily
│   ├── fact_fulfillment_daily
│   ├── fact_support_daily
│   └── fact_marketing_daily
│
├── schema: kpi          ← contract outputs
│   └── kpi_observations
│
└── schema: meta         ← operational metadata
    ├── source_load_log
    ├── reconciliation_runs
    ├── dq_check_results
    ├── freshness_status
    ├── lineage_nodes
    └── lineage_edges
```

### B.2 Data Flow for Phase 1

```
CSV seed files (data/seeds/)
        │
        ▼  [packages/analytics/ingest]
   raw.stg_* tables  +  meta.source_load_log
        │
        ▼  [packages/analytics/ingest — reconcile step]
   conformed.dim_*  +  conformed.fact_*  +  meta.reconciliation_runs
        │
        ▼  [packages/analytics/kpi]
   kpi.kpi_observations  +  meta.freshness_status
        │
        ▼  [packages/analytics/kpi — DQ check step]
   meta.dq_check_results
        │
        ▼  [packages/analytics/ingest — lineage step]
   meta.lineage_nodes  +  meta.lineage_edges
```

### B.3 Migration Strategy

- Migration files live in `packages/db/duckdb/migrations/` as numbered SQL files: `0001_raw_schema.sql`, `0002_conformed_schema.sql`, `0003_kpi_schema.sql`, `0004_meta_schema.sql`.
- A migration runner (`packages/db/duckdb/runner.py`) tracks applied migrations in a `_migrations` table inside the DuckDB file.
- Migrations are always `CREATE TABLE IF NOT EXISTS`; columns are never dropped in Phase 1.

---

## C. Exact Datasets and Schemas

### C.1 Source 1 — Sales Warehouse (`data/seeds/sales/`)

**File:** `sales_order_lines.csv`  
**Row count (seed):** ~87,600 rows (2 years × 365 days × ~120 orders/day average)  
**Random seed:** `42`

| Column | Type | Description | Nullable |
|--------|------|-------------|----------|
| `order_id` | VARCHAR | Unique order identifier. Format: `ORD-{YYYYMMDD}-{6digit}` | No |
| `order_line_id` | VARCHAR | Unique line within order. Format: `{order_id}-L{2digit}` | No |
| `order_date` | DATE | Date the order was placed | No |
| `ship_date` | DATE | Date the order shipped; NULL for unshipped | Yes |
| `sku` | VARCHAR | Product SKU; joins to `dim_sku` | No |
| `region` | VARCHAR | One of: `North`, `South`, `East`, `West` | No |
| `channel` | VARCHAR | One of: `online`, `marketplace`, `b2b` | No |
| `units` | INTEGER | Units sold on this line; always ≥ 1 | No |
| `list_price_usd` | NUMERIC(10,2) | Per-unit list price at time of order | No |
| `discount_pct` | NUMERIC(5,4) | Discount rate 0.0–1.0 | No |
| `net_revenue_usd` | NUMERIC(12,2) | `units × list_price_usd × (1 - discount_pct)`. Pre-computed for realism. | No |
| `currency` | VARCHAR(3) | Always `USD` in seed; placeholder for reconciliation test | No |
| `is_return` | BOOLEAN | True if this line is a credit/return | No |
| `fulfillment_status` | VARCHAR | One of: `fulfilled`, `partial`, `cancelled` | No |
| `warehouse_id` | VARCHAR | Source system warehouse identifier | No |
| `_src_file` | VARCHAR | Injected by ingest: source filename | No |
| `_load_ts` | TIMESTAMP | Injected by ingest: load timestamp | No |

**Staging table:** `raw.stg_sales_order_lines` — identical columns plus five `dq_*` flag columns.

---

### C.2 Source 2 — Inventory System (`data/seeds/inventory/`)

**File:** `inventory_snapshots.csv`  
**Row count (seed):** ~196,560 rows (18 months × 30 days × 6 DCs × 60 SKUs average; with gaps)  
**Random seed:** `42`

| Column | Type | Description | Nullable |
|--------|------|-------------|----------|
| `snapshot_id` | VARCHAR | Unique snapshot row ID. Format: `INV-{YYYYMMDD}-{dc_id}-{sku}` | No |
| `snapshot_date` | DATE | Date of the daily rollup snapshot | No |
| `snapshot_hour` | INTEGER | Hour of the source hourly snapshot that produced this rollup (0–23) | No |
| `sku` | VARCHAR | Product SKU | No |
| `dc_id` | VARCHAR | Distribution centre ID. One of: `DC-NORTH`, `DC-SOUTH`, `DC-EAST`, `DC-WEST`, `DC-CENTRAL`, `DC-WEST2` | No |
| `on_hand_units` | INTEGER | Physical units on hand | No |
| `allocated_units` | INTEGER | Units reserved for open orders | No |
| `inbound_units` | INTEGER | Units expected in next 7 days | No |
| `available_units` | INTEGER | `on_hand_units - allocated_units`; pre-computed | No |
| `reorder_point` | INTEGER | Safety-stock reorder trigger | No |
| `days_of_supply` | NUMERIC(6,1) | `available_units / avg_daily_demand_30d`; NULL if demand history < 7 days | Yes |
| `fill_rate` | NUMERIC(5,4) | `available_units / (available_units + unfilled_demand)`; NULL where no demand | Yes |
| `source_system_ts` | TIMESTAMP | Timestamp as reported by the inventory source system | No |
| `_src_file` | VARCHAR | Injected by ingest | No |
| `_load_ts` | TIMESTAMP | Injected by ingest | No |

**Staging table:** `raw.stg_inventory_snapshots` — identical columns plus five `dq_*` flag columns.

---

### C.3 Source 3 — CRM / Support System (`data/seeds/crm/`)

**File:** `support_tickets.csv`  
**Row count (seed):** ~14,400 rows (12 months × ~40 tickets/day average)  
**Random seed:** `42`

| Column | Type | Description | Nullable |
|--------|------|-------------|----------|
| `ticket_id` | VARCHAR | Unique ticket ID. Format: `TKT-{YYYYMMDD}-{5digit}` | No |
| `created_at` | TIMESTAMP | Ticket creation timestamp (includes time of day) | No |
| `resolved_at` | TIMESTAMP | Resolution timestamp; NULL if still open | Yes |
| `resolution_days` | NUMERIC(6,1) | Calendar days to resolution; NULL if open | Yes |
| `category` | VARCHAR | One of: `late_delivery`, `wrong_item`, `damaged`, `billing`, `product_defect`, `other` | No |
| `severity` | VARCHAR | One of: `low`, `medium`, `high`, `critical` | No |
| `sku` | VARCHAR | SKU associated with complaint; NULL for billing/other | Yes |
| `region` | VARCHAR | Customer region; one of: `North`, `South`, `East`, `West` | No |
| `channel` | VARCHAR | Order channel related to ticket | No |
| `order_id` | VARCHAR | Related order ID; NULL for non-order complaints | Yes |
| `is_repeat_customer` | BOOLEAN | True if customer had a prior ticket in the last 90 days | No |
| `nps_score` | INTEGER | Post-resolution NPS 0–10; NULL if not surveyed | Yes |
| `_src_file` | VARCHAR | Injected by ingest | No |
| `_load_ts` | TIMESTAMP | Injected by ingest | No |

**Staging table:** `raw.stg_support_tickets` — identical columns plus five `dq_*` flag columns.

---

### C.4 Source 4a — Marketing Spend (`data/seeds/marketing/`)

**File:** `marketing_spend.csv`  
**Row count (seed):** ~4,320 rows (24 months × ~6 channel-campaign combinations/day)  
**Random seed:** `42`

| Column | Type | Description | Nullable |
|--------|------|-------------|----------|
| `spend_id` | VARCHAR | Unique row ID. Format: `MKT-{YYYYMMDD}-{channel}-{campaign_id}` | No |
| `date` | DATE | Spend date | No |
| `channel` | VARCHAR | One of: `search_paid`, `social`, `display`, `email`, `affiliate`, `tv_radio` | No |
| `campaign_id` | VARCHAR | Campaign identifier; joins to `dim_campaign` | No |
| `spend_usd` | NUMERIC(12,2) | Daily spend in USD | No |
| `impressions` | INTEGER | Ad impressions; NULL for email/affiliate | Yes |
| `clicks` | INTEGER | Ad clicks; NULL for email | Yes |
| `attributed_revenue_usd` | NUMERIC(12,2) | Platform-reported attributed revenue; intentionally differs from sales warehouse | Yes |
| `_src_file` | VARCHAR | Injected by ingest | No |
| `_load_ts` | TIMESTAMP | Injected by ingest | No |

**Staging table:** `raw.stg_marketing_spend` — identical columns plus five `dq_*` flag columns.

---

### C.5 Source 4b — External Business Events (`data/seeds/events/`)

**File:** `business_events.csv`  
**Row count (seed):** ~120 rows (sparse; key business events over 24-month window)  
**Random seed:** `42`

| Column | Type | Description | Nullable |
|--------|------|-------------|----------|
| `event_id` | VARCHAR | Unique event ID. Format: `EVT-{YYYYMMDD}-{3digit}` | No |
| `event_date` | DATE | Date the event occurred or started | No |
| `event_end_date` | DATE | End date for multi-day events; NULL for point events | Yes |
| `event_type` | VARCHAR | One of: `promo_campaign`, `competitor_action`, `supply_disruption`, `holiday`, `product_launch`, `logistics_incident` | No |
| `severity_label` | VARCHAR | One of: `informational`, `moderate`, `significant` | No |
| `description` | VARCHAR | Human-readable description (max 200 chars) | No |
| `affected_skus` | VARCHAR | Pipe-separated SKU list; NULL means all | Yes |
| `affected_regions` | VARCHAR | Pipe-separated region list; NULL means all | Yes |
| `source` | VARCHAR | One of: `internal`, `news_feed`, `analyst_note` | No |
| `_src_file` | VARCHAR | Injected by ingest | No |
| `_load_ts` | TIMESTAMP | Injected by ingest | No |

**Staging table:** `raw.stg_external_events` — identical columns plus five `dq_*` flag columns.

---

### C.6 Dimension Tables (Conformed)

#### `conformed.dim_date`
Generated programmatically to span 2024-01-01 to 2026-12-31.

| Column | Type | Description |
|--------|------|-------------|
| `date_key` | DATE | Primary key |
| `year` | INTEGER | Calendar year |
| `quarter` | INTEGER | 1–4 |
| `month` | INTEGER | 1–12 |
| `month_name` | VARCHAR | `January`…`December` |
| `week_of_year` | INTEGER | ISO week number |
| `day_of_week` | INTEGER | 1 = Monday …7 = Sunday |
| `day_name` | VARCHAR | `Monday`…`Sunday` |
| `fiscal_year` | INTEGER | NovaMart fiscal year (starts Feb 1) |
| `fiscal_quarter` | INTEGER | 1–4 relative to Feb 1 |
| `fiscal_week` | INTEGER | 1–52 relative to Feb 1 |
| `is_weekend` | BOOLEAN | |
| `is_us_holiday` | BOOLEAN | Major US holidays |
| `is_novamart_promo_period` | BOOLEAN | Seeded promo windows |

#### `conformed.dim_sku`
Manually curated; 80 SKUs across 5 product categories.

| Column | Type | Description |
|--------|------|-------------|
| `sku` | VARCHAR | Primary key. Format: `NOVA-{CAT3}-{X}{2digit}` |
| `product_name` | VARCHAR | Display name |
| `category` | VARCHAR | One of: `audio`, `computing`, `mobile`, `wearables`, `accessories` |
| `sub_category` | VARCHAR | e.g., `true_wireless`, `over_ear`, `laptop`, `tablet` |
| `launch_date` | DATE | Date SKU first went on sale |
| `discontinue_date` | DATE | NULL if still active |
| `unit_cost_usd` | NUMERIC(10,2) | Standard landed cost |
| `list_price_usd` | NUMERIC(10,2) | Current list price |
| `is_active` | BOOLEAN | |
| `is_hero_sku` | BOOLEAN | TRUE for top-10 revenue SKUs (used in Scenario 1) |
| `supplier_id` | VARCHAR | Links to upstream supplier (informational) |
| `weight_kg` | NUMERIC(6,3) | For fulfillment cost modelling |

Special SKU: `NOVA-AUD-X1` (NOVA-BUDS-X1 renamed for schema consistency) launched 3 weeks before the scenario `as_of` date — used for Scenario 3 sparse history.

#### `conformed.dim_region`

| Column | Type | Description |
|--------|------|-------------|
| `region` | VARCHAR | Primary key: `North`, `South`, `East`, `West` |
| `region_label` | VARCHAR | Full label |
| `primary_dc_id` | VARCHAR | Primary distribution centre |
| `secondary_dc_id` | VARCHAR | Overflow DC |
| `timezone` | VARCHAR | IANA timezone |
| `population_index` | NUMERIC(5,2) | Relative demand weight (informational) |

#### `conformed.dim_distribution_center`

| Column | Type | Description |
|--------|------|-------------|
| `dc_id` | VARCHAR | Primary key |
| `dc_name` | VARCHAR | |
| `region` | VARCHAR | FK to `dim_region` |
| `is_active` | BOOLEAN | `DC-WEST2` inactive before 2025-06-01 — causes intentional inventory gaps |
| `active_from` | DATE | |
| `capacity_units` | INTEGER | Total storage capacity |

#### `conformed.dim_campaign`

| Column | Type | Description |
|--------|------|-------------|
| `campaign_id` | VARCHAR | Primary key |
| `campaign_name` | VARCHAR | |
| `campaign_type` | VARCHAR | One of: `brand`, `performance`, `retention`, `product_launch` |
| `start_date` | DATE | |
| `end_date` | DATE | NULL if ongoing |
| `budget_usd` | NUMERIC(12,2) | Total approved budget |
| `owning_team` | VARCHAR | |

---

## D. Grain of Every Source

| Source | Grain | Natural Key |
|--------|-------|-------------|
| Sales warehouse | One row per order line (SKU × order × date) | `order_line_id` |
| Inventory system | One row per SKU × DC × day (daily rollup of hourly snapshots) | `snapshot_date + sku + dc_id` |
| CRM / support | One row per support ticket | `ticket_id` |
| Marketing spend | One row per channel × campaign × day | `date + channel + campaign_id` |
| External events | One row per business event (point or range) | `event_id` |

**Grain mismatches that Phase 1 must handle:**

1. Sales is at order-line level (sub-day); inventory is at daily snapshot level. Reconciliation must aggregate sales to day grain before joining.
2. CRM tickets use timestamp precision; sales use date precision. Ticket-to-order join is fuzzy (order_id nullable on 22% of tickets).
3. Marketing spend is channel × day; sales attribution column in the marketing feed uses a different campaign attribution window (7-day view vs 1-day click). These numbers will not reconcile perfectly by design.
4. External events have a date range grain; all other sources have point-in-time grain. The reconciliation layer must expand event ranges into a per-day flag table.

---

## E. Refresh Cadence of Every Source

| Source | Simulated Cadence | Lag from Real-Time | Historical Coverage | Notes |
|--------|-------------------|--------------------|---------------------|-------|
| Sales warehouse | Daily batch, T+1 (data for day D arrives end of day D+1) | 24–30 hours | 24 months (2024-08-01 → 2026-08-22) | Most recent 2 days always missing from seed — simulates T+1 lag |
| Inventory system | Hourly snapshots rolled up to daily at 23:59 | 1–4 hours for daily rollup | 18 months (2025-02-01 → 2026-08-22) | DC-WEST2 has no data before 2025-06-01; random 3% of days missing across all DCs |
| CRM / support | Daily batch exported at 06:00 UTC | 6 hours | 12 months (2025-08-22 → 2026-08-22) | Tickets created after 23:00 previous day may arrive late (late arrival flag) |
| Marketing spend | Daily batch from ad platforms, T+1 | 24–48 hours | 24 months (2024-08-01 → 2026-08-22) | TV/radio spend arrives 2 days late; email has 0 lag |
| External events | Manual/event-driven; no scheduled cadence | N/A | Sparse — ~5 events/month | Some events back-dated (retroactive supply disruption flags) |

**Freshness SLA per KPI (Phase 1 reference values used by freshness tracker):**

| KPI | Primary Source | SLA Hours | Staleness Threshold (Phase 2 abstention) |
|-----|---------------|-----------|------------------------------------------|
| `revenue` | Sales warehouse | 36 | > 72 hours |
| `units_sold` | Sales warehouse | 36 | > 72 hours |
| `average_selling_price` | Sales warehouse | 36 | > 72 hours |
| `inventory_availability` | Inventory system | 12 | > 24 hours |
| `on_time_delivery` | Sales + inventory | 36 | > 72 hours |
| `customer_complaints` | CRM | 24 | > 48 hours |
| `marketing_spend` | Marketing feed | 48 | > 96 hours |

---

## F. Data-Quality Problems Intentionally Simulated

Each problem must be injected deterministically by the seed generator, recorded per-row with the `dq_*` flags, and surfaced in `meta.dq_check_results` after ingestion.

### F.1 Sales Warehouse DQ Problems

| Problem ID | Description | Injection Rule | Affected Rows | Flag |
|------------|-------------|---------------|---------------|------|
| DQ-S-01 | ~1.2% of `net_revenue_usd` values are NULL | Random draw, seed 42, applied to non-return rows only | ~1,050 rows | `dq_is_null_critical = TRUE` |
| DQ-S-02 | ~0.4% of order lines are exact duplicates (same `order_line_id`, all fields identical) | Duplicated rows inserted adjacent to originals | ~350 rows | `dq_is_duplicate = TRUE` |
| DQ-S-03 | ~1.8% of rows have `order_date` that arrives in the next day's file (late arrival) | `_load_ts` is 25+ hours after `order_date` | ~1,575 rows | `dq_is_late_arrival = TRUE` |
| DQ-S-04 | ~0.3% of rows have `net_revenue_usd` that doesn't match `units × list_price × (1 - discount_pct)` within $0.02 tolerance | Arithmetic noise injected | ~262 rows | `dq_is_out_of_range = TRUE` |
| DQ-S-05 | ~0.6% of rows reference a SKU not present in `dim_sku` (orphan SKUs from discontinued products) | SKU values like `NOVA-DISC-XX` | ~525 rows | `dq_is_out_of_range = TRUE` (orphan flag in reconcile report) |

### F.2 Inventory System DQ Problems

| Problem ID | Description | Injection Rule | Affected Rows | Flag |
|------------|-------------|---------------|---------------|------|
| DQ-I-01 | ~3.1% of `fill_rate` values are NULL (demand data missing for newer SKUs) | Applied to SKUs with < 30 days of history | ~6,094 rows | `dq_is_null_critical = TRUE` |
| DQ-I-02 | DC-WEST2 entirely missing before 2025-06-01 | No rows generated for that DC before cutoff | ~11,000 missing rows | Surfaced as gap in reconciliation report |
| DQ-I-03 | ~2.5% of snapshots have `available_units` < 0 (allocation bug) | Injected to specific SKU-DC combos | ~4,914 rows | `dq_is_out_of_range = TRUE` |
| DQ-I-04 | ~1.5% of snapshot timestamps are from the future relative to `snapshot_date` | `source_system_ts` set to T+2 days | ~2,949 rows | `dq_is_out_of_range = TRUE` |
| DQ-I-05 | ~4.0% of days have the same SKU-DC appear twice (duplicate snapshot from retry) | Duplicate rows with slightly different `snapshot_hour` | ~7,862 rows | `dq_is_duplicate = TRUE` |

### F.3 CRM / Support DQ Problems

| Problem ID | Description | Injection Rule | Affected Rows | Flag |
|------------|-------------|---------------|---------------|------|
| DQ-C-01 | ~22% of tickets have NULL `sku` (billing and general complaints) | By category rule | ~3,168 rows | Expected NULL — not flagged as error; documented in contract |
| DQ-C-02 | ~5% of `order_id` values reference an order not in the sales warehouse | Orphan references | ~720 rows | `dq_is_out_of_range = TRUE` |
| DQ-C-03 | ~2% of tickets have `resolved_at` before `created_at` | Timestamp inversion bug | ~288 rows | `dq_is_out_of_range = TRUE` |
| DQ-C-04 | ~1% of tickets are exact duplicates | System retry artifact | ~144 rows | `dq_is_duplicate = TRUE` |
| DQ-C-05 | ~8% of tickets arrive in the next day's batch (late arrival) | `_load_ts` > 24 hours after `created_at` | ~1,152 rows | `dq_is_late_arrival = TRUE` |

### F.4 Marketing Spend DQ Problems

| Problem ID | Description | Injection Rule | Affected Rows | Flag |
|------------|-------------|---------------|---------------|------|
| DQ-M-01 | TV/radio spend arrives with 2-day lag | `_load_ts` = `date + 2 days` | ~1,440 rows | `dq_is_late_arrival = TRUE` |
| DQ-M-02 | ~1.5% of `attributed_revenue_usd` values are NULL | Platform reporting gaps | ~65 rows | `dq_is_null_critical = TRUE` |
| DQ-M-03 | `attributed_revenue_usd` from marketing feed systematically over-reports vs. sales warehouse by 8–15% | Attribution window mismatch — by design | All attributed rows | Not a DQ flag — documented as source reconciliation difference in `reconciliation_runs` |
| DQ-M-04 | ~0.8% of rows reference a `campaign_id` not in `dim_campaign` | Orphan campaign IDs | ~35 rows | `dq_is_out_of_range = TRUE` |

### F.5 Aggregate DQ Score Formula

Computed per source per reconciliation run and stored in `meta.reconciliation_runs.dq_score`:

```
dq_score = 1.0
         - (null_critical_rate × 0.40)
         - (duplicate_rate     × 0.25)
         - (out_of_range_rate  × 0.25)
         - (late_arrival_rate  × 0.10)
```

Score range: 0.0 (worst) to 1.0 (perfect). Phase 2 abstention rule R5 fires when `dq_score < 0.60` on a primary source.

---

## G. Reconciliation Rules

Reconciliation transforms raw staging tables into conformed fact tables. Each rule is named, versioned, and recorded in `meta.reconciliation_runs`.

### G.1 Rule: RECON-SKU-MAP — SKU Normalisation

- **Applies to:** All sources containing `sku`.
- **Logic:** Inner-join staging table to `conformed.dim_sku`. Rows where SKU is not found in `dim_sku` are written to a `reconciliation_orphans` partition in the staging table with `orphan_reason = 'sku_not_found'` and excluded from conformed facts.
- **Orphan threshold:** If orphan rate > 2% for any single day, the reconciliation run for that source is flagged `status = 'degraded'` (not failed).
- **Version:** `v1.0`

### G.2 Rule: RECON-DATE-ALIGN — Calendar Grain Alignment

- **Applies to:** All fact tables.
- **Logic:** Every fact row must have a valid `date_key` in `conformed.dim_date`. Rows with `order_date` / `snapshot_date` / `date` outside the dim_date range (2024-01-01 – 2026-12-31) are dropped with `orphan_reason = 'date_out_of_range'`.
- **Version:** `v1.0`

### G.3 Rule: RECON-DEDUP — Duplicate Elimination

- **Applies to:** All staging tables where `dq_is_duplicate = TRUE`.
- **Logic:** Keep the row with the latest `_load_ts` among duplicates sharing the same natural key. Log count of dropped duplicates in `reconciliation_runs.duplicate_rows_dropped`.
- **Version:** `v1.0`

### G.4 Rule: RECON-SALES-AGG — Sales Aggregation to Day Grain

- **Applies to:** `raw.stg_sales_order_lines` → `conformed.fact_sales_daily`.
- **Logic:**
  1. Exclude rows where `dq_is_duplicate = TRUE` (after RECON-DEDUP).
  2. Exclude orphan SKUs.
  3. Exclude `is_return = TRUE` rows (returns are tracked separately, not in Phase 1 scope).
  4. Group by `order_date`, `sku`, `region`, `channel`.
  5. Aggregate: `SUM(units)`, `SUM(net_revenue_usd)`, `COUNT(DISTINCT order_id)`, `AVG(discount_pct)`.
  6. Compute `avg_selling_price_usd = SUM(net_revenue_usd) / NULLIF(SUM(units), 0)`.
  7. NULL `net_revenue_usd` rows (DQ-S-01): exclude from revenue sum but count in `null_revenue_rows` audit column.
- **Output columns:** `date_key`, `sku`, `region`, `channel`, `units_sold`, `gross_revenue_usd`, `net_revenue_usd`, `orders_count`, `avg_discount_pct`, `avg_selling_price_usd`, `null_revenue_rows`, `reconcile_run_id`.
- **Version:** `v1.0`

### G.5 Rule: RECON-INV-DEDUP — Inventory Snapshot Deduplication and Fill

- **Applies to:** `raw.stg_inventory_snapshots` → `conformed.fact_inventory_daily`.
- **Logic:**
  1. For duplicate snapshot rows (DQ-I-05): keep the row where `snapshot_hour` is highest (latest intraday snapshot wins).
  2. For `available_units < 0` (DQ-I-03): clamp to 0, set `is_imputed = TRUE`, log in `dq_check_results`.
  3. For future-dated timestamps (DQ-I-04): use `snapshot_date` as the authoritative date, not `source_system_ts`.
  4. Group by `snapshot_date`, `sku`, `dc_id` and take the last-hour snapshot as the day's value.
  5. Compute `fill_rate` where NULL by linear interpolation only if ≤ 2 consecutive days missing AND SKU has ≥ 14 days of prior data. Otherwise leave NULL and set `is_imputed = FALSE`.
  6. Join to `conformed.dim_distribution_center`; drop rows for inactive DCs before their `active_from` date.
- **Output columns:** `date_key`, `sku`, `dc_id`, `on_hand_units`, `allocated_units`, `available_units`, `inbound_units`, `reorder_point`, `days_of_supply`, `fill_rate`, `is_imputed`, `reconcile_run_id`.
- **Version:** `v1.0`

### G.6 Rule: RECON-OTD — On-Time Delivery Computation

- **Applies to:** `raw.stg_sales_order_lines` → `conformed.fact_fulfillment_daily`.
- **Logic:**
  1. Use only rows where `fulfillment_status IN ('fulfilled', 'partial')` and `ship_date IS NOT NULL`.
  2. Join to `business_events` to get the promised delivery standard (assume 3-day standard for `online`, 5-day for `marketplace`, 2-day for `b2b`).
  3. `is_on_time = CASE WHEN (ship_date - order_date) <= delivery_standard_days THEN TRUE ELSE FALSE END`.
  4. Group by `order_date`, `region`, `channel`.
  5. Aggregate: `COUNT(*) AS total_shipments`, `SUM(is_on_time::INT) AS on_time_shipments`, `on_time_pct = on_time_shipments / NULLIF(total_shipments, 0)`, `AVG(ship_date - order_date) AS avg_ship_lag_days`.
- **Output columns:** `date_key`, `region`, `channel`, `total_shipments`, `on_time_shipments`, `on_time_pct`, `avg_ship_lag_days`, `reconcile_run_id`.
- **Version:** `v1.0`

### G.7 Rule: RECON-SUPPORT-AGG — CRM Ticket Aggregation

- **Applies to:** `raw.stg_support_tickets` → `conformed.fact_support_daily`.
- **Logic:**
  1. Deduplicate via RECON-DEDUP on `ticket_id`.
  2. Drop rows where `dq_is_out_of_range = TRUE` AND `resolved_at < created_at` (DQ-C-03).
  3. Derive `ticket_date = DATE(created_at)`.
  4. Group by `ticket_date`, `category`, `region`.
  5. Aggregate: `COUNT(*) AS ticket_count`, `AVG(resolution_days) AS avg_resolution_days`, `SUM(CASE WHEN severity IN ('high','critical') THEN 1 ELSE 0 END) AS high_severity_count`.
  6. Orphan order_id references (DQ-C-02): these rows are still included in ticket counts but `order_id` is set to NULL with `has_orphan_order_ref = TRUE`.
- **Output columns:** `date_key`, `category`, `region`, `ticket_count`, `high_severity_count`, `avg_resolution_days`, `has_orphan_order_ref_count`, `reconcile_run_id`.
- **Version:** `v1.0`

### G.8 Rule: RECON-MKT-AGG — Marketing Spend Aggregation

- **Applies to:** `raw.stg_marketing_spend` → `conformed.fact_marketing_daily`.
- **Logic:**
  1. Drop rows where `campaign_id` not in `dim_campaign` (DQ-M-04 orphans).
  2. Group by `date`, `channel`, `campaign_id`.
  3. Aggregate: `SUM(spend_usd)`, `SUM(impressions)`, `SUM(clicks)`, `SUM(attributed_revenue_usd)`.
  4. Compute `ctr = SUM(clicks) / NULLIF(SUM(impressions), 0)`.
  5. **Do not** reconcile `attributed_revenue_usd` against sales warehouse revenue here. Document as known source divergence in `reconciliation_runs.notes`.
- **Output columns:** `date_key`, `channel`, `campaign_id`, `spend_usd`, `impressions`, `clicks`, `ctr`, `attributed_revenue_usd`, `reconcile_run_id`.
- **Version:** `v1.0`

### G.9 Rule: RECON-FRESHNESS — Freshness Lag Calculation

- **Applies to:** All sources; runs after each ingest pass.
- **Logic:** For each source, compute `freshness_lag_hours = EXTRACT(EPOCH FROM (NOW() - MAX(_load_ts))) / 3600`. Compare against the KPI-specific SLA. Write result to `meta.freshness_status`.
- **Version:** `v1.0`

---

## H. Conformed Data Model

### H.1 `conformed.fact_sales_daily`

| Column | Type | PK/FK | Notes |
|--------|------|-------|-------|
| `date_key` | DATE | FK → dim_date | |
| `sku` | VARCHAR | FK → dim_sku | |
| `region` | VARCHAR | FK → dim_region | |
| `channel` | VARCHAR | | |
| `units_sold` | INTEGER | | |
| `gross_revenue_usd` | NUMERIC(14,2) | | Pre-discount |
| `net_revenue_usd` | NUMERIC(14,2) | | Post-discount |
| `orders_count` | INTEGER | | |
| `avg_discount_pct` | NUMERIC(6,4) | | |
| `avg_selling_price_usd` | NUMERIC(10,2) | | `net_revenue / units` |
| `null_revenue_rows` | INTEGER | | DQ audit count |
| `reconcile_run_id` | VARCHAR | FK → meta.reconciliation_runs | |

**Composite PK:** `(date_key, sku, region, channel)`

### H.2 `conformed.fact_inventory_daily`

| Column | Type | PK/FK | Notes |
|--------|------|-------|-------|
| `date_key` | DATE | FK → dim_date | |
| `sku` | VARCHAR | FK → dim_sku | |
| `dc_id` | VARCHAR | FK → dim_distribution_center | |
| `on_hand_units` | INTEGER | | |
| `allocated_units` | INTEGER | | |
| `available_units` | INTEGER | | Clamped ≥ 0 |
| `inbound_units` | INTEGER | | |
| `reorder_point` | INTEGER | | |
| `days_of_supply` | NUMERIC(6,1) | | NULL if insufficient history |
| `fill_rate` | NUMERIC(6,4) | | NULL or imputed |
| `is_imputed` | BOOLEAN | | TRUE if fill_rate was interpolated |
| `reconcile_run_id` | VARCHAR | FK → meta.reconciliation_runs | |

**Composite PK:** `(date_key, sku, dc_id)`

### H.3 `conformed.fact_fulfillment_daily`

| Column | Type | PK/FK | Notes |
|--------|------|-------|-------|
| `date_key` | DATE | FK → dim_date | |
| `region` | VARCHAR | FK → dim_region | |
| `channel` | VARCHAR | | |
| `total_shipments` | INTEGER | | |
| `on_time_shipments` | INTEGER | | |
| `on_time_pct` | NUMERIC(6,4) | | |
| `avg_ship_lag_days` | NUMERIC(5,2) | | |
| `reconcile_run_id` | VARCHAR | FK → meta.reconciliation_runs | |

**Composite PK:** `(date_key, region, channel)`

### H.4 `conformed.fact_support_daily`

| Column | Type | PK/FK | Notes |
|--------|------|-------|-------|
| `date_key` | DATE | FK → dim_date | |
| `category` | VARCHAR | | |
| `region` | VARCHAR | FK → dim_region | |
| `ticket_count` | INTEGER | | |
| `high_severity_count` | INTEGER | | |
| `avg_resolution_days` | NUMERIC(6,2) | | NULL if all open |
| `has_orphan_order_ref_count` | INTEGER | | |
| `reconcile_run_id` | VARCHAR | FK → meta.reconciliation_runs | |

**Composite PK:** `(date_key, category, region)`

### H.5 `conformed.fact_marketing_daily`

| Column | Type | PK/FK | Notes |
|--------|------|-------|-------|
| `date_key` | DATE | FK → dim_date | |
| `channel` | VARCHAR | | |
| `campaign_id` | VARCHAR | FK → dim_campaign | |
| `spend_usd` | NUMERIC(12,2) | | |
| `impressions` | INTEGER | | NULL for email |
| `clicks` | INTEGER | | NULL for email |
| `ctr` | NUMERIC(8,6) | | |
| `attributed_revenue_usd` | NUMERIC(12,2) | | |
| `reconcile_run_id` | VARCHAR | FK → meta.reconciliation_runs | |

**Composite PK:** `(date_key, channel, campaign_id)`

### H.6 `meta.source_load_log`

| Column | Type | Notes |
|--------|------|-------|
| `load_id` | VARCHAR | PK. Format: `LOAD-{source}-{YYYYMMDDHHMMSS}` |
| `source_name` | VARCHAR | One of: `sales`, `inventory`, `crm`, `marketing`, `events` |
| `file_path` | VARCHAR | Relative path to the loaded file |
| `file_sha256` | VARCHAR | SHA-256 of the raw file |
| `rows_raw` | INTEGER | Rows in the source file |
| `rows_loaded` | INTEGER | Rows actually inserted |
| `rows_rejected` | INTEGER | Rows rejected at parse time |
| `load_ts` | TIMESTAMP | When this load ran |
| `status` | VARCHAR | `success` / `partial` / `failed` |

### H.7 `meta.reconciliation_runs`

| Column | Type | Notes |
|--------|------|-------|
| `run_id` | VARCHAR | PK. Format: `RECON-{source}-{YYYYMMDDHHMMSS}` |
| `source_name` | VARCHAR | |
| `rule_id` | VARCHAR | e.g., `RECON-SALES-AGG` |
| `rule_version` | VARCHAR | |
| `rows_in` | INTEGER | Staging rows processed |
| `rows_out` | INTEGER | Conformed rows written |
| `rows_orphaned` | INTEGER | |
| `rows_deduplicated` | INTEGER | |
| `matched_pct` | NUMERIC(6,4) | `rows_out / rows_in` |
| `dq_score` | NUMERIC(5,4) | Aggregate DQ score (section F.5) |
| `freshness_lag_hours` | NUMERIC(6,2) | |
| `status` | VARCHAR | `ok` / `degraded` / `failed` |
| `notes` | VARCHAR | Free-text for known divergences |
| `run_ts` | TIMESTAMP | |

### H.8 `meta.dq_check_results`

| Column | Type | Notes |
|--------|------|-------|
| `check_id` | VARCHAR | PK |
| `source_name` | VARCHAR | |
| `table_name` | VARCHAR | |
| `check_name` | VARCHAR | e.g., `max_null_rate`, `max_duplicate_rate` |
| `threshold` | NUMERIC(8,5) | From KPI contract `quality_rules` |
| `actual_value` | NUMERIC(8,5) | Measured value |
| `passed` | BOOLEAN | |
| `checked_at` | TIMESTAMP | |
| `reconcile_run_id` | VARCHAR | |

### H.9 `meta.freshness_status`

| Column | Type | Notes |
|--------|------|-------|
| `freshness_id` | VARCHAR | PK |
| `kpi_id` | VARCHAR | |
| `source_name` | VARCHAR | |
| `sla_hours` | NUMERIC(6,2) | From KPI contract |
| `actual_lag_hours` | NUMERIC(6,2) | |
| `is_within_sla` | BOOLEAN | |
| `checked_at` | TIMESTAMP | |
| `reconcile_run_id` | VARCHAR | |

---

## I. KPI Semantic Contract Format

### I.1 Schema Definition

Every KPI contract is a YAML file at `packages/contracts/kpis/{kpi_id}.yaml`.  
All contracts are validated against `packages/contracts/schemas/kpi_contract.json` (JSON Schema draft-07) on load.

```yaml
# packages/contracts/kpis/{kpi_id}.yaml

id: string                         # snake_case, matches filename
version: string                    # semver e.g. "1.0.0"
display_name: string               # UI label
description: string                # Business definition (1–3 sentences)
owner: string                      # Accountable business domain: finance | ops | marketing
unit: string                       # "usd" | "units" | "pct" | "rate" | "count"
direction: string                  # "higher_is_better" | "lower_is_better"

grain:
  supported: [string]              # e.g. [day, week, month, region, category, sku]
  default: string                  # Default grain for API responses

formula_type: string               # "sql" | "derived"
  # "sql"     → SQL template executed directly against conformed facts
  # "derived" → computed from other KPI observations (e.g. ASP = revenue / units)

sql_template: string               # Relative path from repo root; required if formula_type = sql
derived_from:                      # Required if formula_type = derived
  numerator_kpi: string
  denominator_kpi: string
  operation: string                # "divide" | "subtract" | "ratio"

dependencies:                      # Conformed tables this KPI reads from
  - string

inputs:                            # Runtime parameters injected into SQL template
  - name: string
    type: string                   # date | date_range | enum | string | integer
    required: boolean
    default: string | null

materiality:
  pct_change_threshold: number     # Signal if |delta_pct| exceeds this (e.g. 5.0 = 5%)
  min_absolute_change:  number     # Minimum absolute change to avoid noise signals
  min_absolute_change_unit: string # "usd" | "units" | "pct_points"

freshness_sla_hours: number        # Max acceptable source lag before freshness violation

quality_rules:
  - rule: string                   # "max_null_rate" | "max_duplicate_rate" | "max_orphan_rate"
    threshold: number              # Fraction 0.0–1.0

lineage:
  sources: [string]                # Source system names
  transforms: [string]             # Reconciliation rule IDs applied

decomposition:                     # Optional; defines parent-child KPI tree
  relationship: string             # "multiplicative" | "additive"
  children: [string]               # Child KPI IDs

access:
  personas: [string]               # Personas allowed to see this KPI
  field_masking: object            # Fields to mask per persona (Phase 5)
```

### I.2 The Seven KPI Contracts

#### `revenue.yaml`

```yaml
id: revenue
version: "1.0.0"
display_name: Net Revenue
description: >
  Sum of net sales revenue after discounts across all channels and regions.
  Excludes returns. Source of truth is the sales warehouse fact table.
owner: finance
unit: usd
direction: higher_is_better
grain:
  supported: [day, week, month, region, channel, category, sku]
  default: day
formula_type: sql
sql_template: packages/contracts/kpis/sql/revenue.sql
dependencies: [fact_sales_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
  - name: grain
    type: enum
    required: false
    default: day
  - name: region
    type: string
    required: false
    default: null
  - name: channel
    type: string
    required: false
    default: null
materiality:
  pct_change_threshold: 5.0
  min_absolute_change: 50000
  min_absolute_change_unit: usd
freshness_sla_hours: 36
quality_rules:
  - rule: max_null_rate
    threshold: 0.015
  - rule: max_duplicate_rate
    threshold: 0.005
lineage:
  sources: [sales_warehouse]
  transforms: [RECON-SKU-MAP, RECON-DATE-ALIGN, RECON-DEDUP, RECON-SALES-AGG]
decomposition:
  relationship: multiplicative
  children: [units_sold, average_selling_price]
access:
  personas: [cfo, analyst, supply_chain_manager]
  field_masking: {}
```

#### `units_sold.yaml`

```yaml
id: units_sold
version: "1.0.0"
display_name: Units Sold
description: Total units sold net of returns, aggregated from order lines.
owner: ops
unit: units
direction: higher_is_better
grain:
  supported: [day, week, month, region, channel, category, sku]
  default: day
formula_type: sql
sql_template: packages/contracts/kpis/sql/units_sold.sql
dependencies: [fact_sales_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
  - name: grain
    type: enum
    required: false
    default: day
materiality:
  pct_change_threshold: 5.0
  min_absolute_change: 1000
  min_absolute_change_unit: units
freshness_sla_hours: 36
quality_rules:
  - rule: max_null_rate
    threshold: 0.005
  - rule: max_duplicate_rate
    threshold: 0.005
lineage:
  sources: [sales_warehouse]
  transforms: [RECON-SKU-MAP, RECON-DATE-ALIGN, RECON-DEDUP, RECON-SALES-AGG]
decomposition:
  relationship: null
  children: []
access:
  personas: [cfo, analyst, supply_chain_manager]
  field_masking: {}
```

#### `average_selling_price.yaml`

```yaml
id: average_selling_price
version: "1.0.0"
display_name: Average Selling Price
description: >
  Net revenue divided by units sold. Derived KPI; not read from a separate table.
  Sensitive to mix shifts across SKU and channel.
owner: finance
unit: usd
direction: higher_is_better
grain:
  supported: [day, week, month, region, channel, category]
  default: week
formula_type: derived
derived_from:
  numerator_kpi: revenue
  denominator_kpi: units_sold
  operation: divide
dependencies: [fact_sales_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
materiality:
  pct_change_threshold: 3.0
  min_absolute_change: 2.00
  min_absolute_change_unit: usd
freshness_sla_hours: 36
quality_rules:
  - rule: max_null_rate
    threshold: 0.020
lineage:
  sources: [sales_warehouse]
  transforms: [RECON-SALES-AGG]
decomposition:
  relationship: null
  children: []
access:
  personas: [cfo, analyst, supply_chain_manager]
  field_masking: {}
```

#### `inventory_availability.yaml`

```yaml
id: inventory_availability
version: "1.0.0"
display_name: Inventory Availability (Fill Rate)
description: >
  Revenue-weighted average fill rate across all active SKUs and distribution centres.
  Fill rate = available units / (available + unfilled demand). NULL where demand history
  is insufficient; these are excluded from the weighted average.
owner: ops
unit: pct
direction: higher_is_better
grain:
  supported: [day, week, sku, dc, region]
  default: day
formula_type: sql
sql_template: packages/contracts/kpis/sql/inventory_availability.sql
dependencies: [fact_inventory_daily, fact_sales_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
  - name: weight_by
    type: enum
    required: false
    default: revenue
materiality:
  pct_change_threshold: 3.0
  min_absolute_change: 2.0
  min_absolute_change_unit: pct_points
freshness_sla_hours: 12
quality_rules:
  - rule: max_null_rate
    threshold: 0.050
  - rule: max_orphan_rate
    threshold: 0.020
lineage:
  sources: [inventory_system]
  transforms: [RECON-SKU-MAP, RECON-DATE-ALIGN, RECON-INV-DEDUP]
decomposition:
  relationship: null
  children: []
access:
  personas: [cfo, analyst, supply_chain_manager]
  field_masking: {}
```

#### `on_time_delivery.yaml`

```yaml
id: on_time_delivery
version: "1.0.0"
display_name: On-Time Delivery Rate
description: >
  Percentage of fulfilled shipments delivered within the channel-specific
  promised delivery standard. Computed from order ship dates vs. order dates.
owner: ops
unit: pct
direction: higher_is_better
grain:
  supported: [day, week, month, region, channel]
  default: week
formula_type: sql
sql_template: packages/contracts/kpis/sql/on_time_delivery.sql
dependencies: [fact_fulfillment_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
  - name: region
    type: string
    required: false
    default: null
materiality:
  pct_change_threshold: 3.0
  min_absolute_change: 2.0
  min_absolute_change_unit: pct_points
freshness_sla_hours: 36
quality_rules:
  - rule: max_null_rate
    threshold: 0.010
lineage:
  sources: [sales_warehouse]
  transforms: [RECON-SKU-MAP, RECON-DATE-ALIGN, RECON-DEDUP, RECON-OTD]
decomposition:
  relationship: null
  children: []
access:
  personas: [cfo, analyst, supply_chain_manager]
  field_masking: {}
```

#### `customer_complaints.yaml`

```yaml
id: customer_complaints
version: "1.0.0"
display_name: Customer Complaint Rate
description: >
  Number of support tickets per 1,000 units sold in the same period and region.
  Requires join between CRM and sales warehouse; subject to CRM 6-hour batch lag.
owner: ops
unit: rate
direction: lower_is_better
grain:
  supported: [day, week, month, region, category]
  default: week
formula_type: sql
sql_template: packages/contracts/kpis/sql/customer_complaints.sql
dependencies: [fact_support_daily, fact_sales_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
  - name: region
    type: string
    required: false
    default: null
  - name: category
    type: string
    required: false
    default: null
materiality:
  pct_change_threshold: 10.0
  min_absolute_change: 0.5
  min_absolute_change_unit: rate
freshness_sla_hours: 24
quality_rules:
  - rule: max_null_rate
    threshold: 0.050
  - rule: max_orphan_rate
    threshold: 0.060
lineage:
  sources: [crm_support]
  transforms: [RECON-DEDUP, RECON-DATE-ALIGN, RECON-SUPPORT-AGG]
decomposition:
  relationship: null
  children: []
access:
  personas: [cfo, analyst, supply_chain_manager]
  field_masking: {}
```

#### `marketing_spend.yaml`

```yaml
id: marketing_spend
version: "1.0.0"
display_name: Marketing Spend
description: >
  Total USD spend across all paid marketing channels and campaigns.
  Does not include headcount or agency fees. TV/radio spend carries a known
  2-day reporting lag; this is documented but not imputed.
owner: marketing
unit: usd
direction: lower_is_better
grain:
  supported: [day, week, month, channel, campaign]
  default: week
formula_type: sql
sql_template: packages/contracts/kpis/sql/marketing_spend.sql
dependencies: [fact_marketing_daily]
inputs:
  - name: period_start
    type: date
    required: true
  - name: period_end
    type: date
    required: true
  - name: channel
    type: string
    required: false
    default: null
materiality:
  pct_change_threshold: 10.0
  min_absolute_change: 5000
  min_absolute_change_unit: usd
freshness_sla_hours: 48
quality_rules:
  - rule: max_null_rate
    threshold: 0.020
  - rule: max_orphan_rate
    threshold: 0.010
lineage:
  sources: [marketing_platform]
  transforms: [RECON-DATE-ALIGN, RECON-DEDUP, RECON-MKT-AGG]
decomposition:
  relationship: null
  children: []
access:
  personas: [cfo, analyst]
  field_masking:
    supply_chain_manager: [spend_usd, attributed_revenue_usd]
```

### I.3 `kpi.kpi_observations` Table

Every KPI contract execution writes one row per (kpi_id, period, grain_value):

| Column | Type | Notes |
|--------|------|-------|
| `obs_id` | VARCHAR | PK. Format: `OBS-{kpi_id}-{period}-{grain_hash}` |
| `kpi_id` | VARCHAR | FK to contract registry |
| `contract_version` | VARCHAR | From contract YAML |
| `contract_sql_hash` | VARCHAR | SHA-256 of the SQL template at execution time |
| `period_start` | DATE | |
| `period_end` | DATE | |
| `grain` | VARCHAR | e.g. `day`, `week`, `region:North` |
| `value` | NUMERIC(18,4) | The computed KPI value |
| `unit` | VARCHAR | From contract |
| `prior_period_start` | DATE | Comparison period start |
| `prior_period_end` | DATE | Comparison period end |
| `prior_value` | NUMERIC(18,4) | KPI value for comparison period |
| `delta_absolute` | NUMERIC(18,4) | `value - prior_value` |
| `delta_pct` | NUMERIC(8,4) | `(value - prior_value) / NULLIF(prior_value, 0) × 100` |
| `null_input_rows` | INTEGER | DQ audit: null rows excluded from computation |
| `computed_at` | TIMESTAMP | |
| `pipeline_run_id` | VARCHAR | Links to the pipeline run that produced this |
| `freshness_run_id` | VARCHAR | FK to meta.freshness_status |

---

## J. Data Lineage Model

### J.1 Node Types

Lineage is stored as a directed acyclic graph (DAG) in `meta.lineage_nodes` and `meta.lineage_edges`.

| Node Type | `node_type` value | Example `node_id` |
|-----------|-------------------|-------------------|
| Source file | `source` | `src:sales_warehouse:sales_order_lines.csv` |
| Staging table | `staging` | `stg:raw.stg_sales_order_lines` |
| Reconciliation rule | `transform` | `xfm:RECON-SALES-AGG:v1.0` |
| Conformed fact | `fact` | `fact:conformed.fact_sales_daily` |
| KPI contract | `contract` | `kpi_contract:revenue:v1.0.0` |
| KPI observation | `observation` | `obs:OBS-revenue-2026W34-day` |

### J.2 `meta.lineage_nodes`

| Column | Type | Notes |
|--------|------|-------|
| `node_id` | VARCHAR | PK. Composite string key as above |
| `node_type` | VARCHAR | One of the types in J.1 |
| `display_name` | VARCHAR | Human-readable label |
| `metadata_json` | JSON | Type-specific fields (file path, table name, contract version, etc.) |
| `created_at` | TIMESTAMP | When this node was first recorded |

### J.3 `meta.lineage_edges`

| Column | Type | Notes |
|--------|------|-------|
| `edge_id` | VARCHAR | PK |
| `from_node_id` | VARCHAR | FK → lineage_nodes |
| `to_node_id` | VARCHAR | FK → lineage_nodes |
| `edge_type` | VARCHAR | `loads_into` / `transforms_into` / `computes_from` |
| `pipeline_run_id` | VARCHAR | Run that created this edge |
| `created_at` | TIMESTAMP | |

### J.4 Standard Lineage Chain for All KPIs

Every `kpi_observation` must have a traceable path of edges:

```
source (CSV file)
  └─[loads_into]──► staging table
                      └─[transforms_into]──► reconciliation rule node
                                               └─[transforms_into]──► conformed fact table
                                                                         └─[computes_from]──► kpi contract
                                                                                               └─[computes_from]──► kpi observation
```

For derived KPIs (`average_selling_price`), the chain branches:

```
source
  └── ... ──► fact_sales_daily ──► kpi_contract:revenue ──► obs:revenue
                                └──► kpi_contract:units_sold ──► obs:units_sold
                                                                    └─[derives_from]──► obs:average_selling_price
```

### J.5 Lineage API Shape (Phase 1)

`GET /api/v1/kpis/{kpi_id}/lineage` returns:

```json
{
  "kpi_id": "revenue",
  "observation_id": "OBS-revenue-2026W34-day",
  "nodes": [
    { "node_id": "src:sales_warehouse:sales_order_lines.csv", "node_type": "source", "display_name": "Sales Warehouse — order lines", "metadata": { "file_path": "data/seeds/sales/sales_order_lines.csv", "rows": 87600, "last_modified": "2026-08-22T01:30:00Z" } },
    { "node_id": "stg:raw.stg_sales_order_lines", "node_type": "staging", "display_name": "Staging: stg_sales_order_lines", "metadata": { "dq_score": 0.974 } },
    { "node_id": "xfm:RECON-SALES-AGG:v1.0", "node_type": "transform", "display_name": "Reconciliation: RECON-SALES-AGG v1.0", "metadata": { "rows_in": 87250, "rows_out": 86110, "matched_pct": 0.987 } },
    { "node_id": "fact:conformed.fact_sales_daily", "node_type": "fact", "display_name": "Conformed: fact_sales_daily" },
    { "node_id": "kpi_contract:revenue:v1.0.0", "node_type": "contract", "display_name": "KPI Contract: Net Revenue v1.0.0", "metadata": { "sql_hash": "a3f9..." } },
    { "node_id": "OBS-revenue-2026W34-day", "node_type": "observation", "display_name": "Revenue — Week 34 2026", "metadata": { "value": 1240000, "computed_at": "2026-08-22T02:15:00Z" } }
  ],
  "edges": [
    { "from": "src:sales_warehouse:sales_order_lines.csv", "to": "stg:raw.stg_sales_order_lines", "type": "loads_into" },
    { "from": "stg:raw.stg_sales_order_lines", "to": "xfm:RECON-SALES-AGG:v1.0", "type": "transforms_into" },
    { "from": "xfm:RECON-SALES-AGG:v1.0", "to": "fact:conformed.fact_sales_daily", "type": "transforms_into" },
    { "from": "fact:conformed.fact_sales_daily", "to": "kpi_contract:revenue:v1.0.0", "type": "computes_from" },
    { "from": "kpi_contract:revenue:v1.0.0", "to": "OBS-revenue-2026W34-day", "type": "computes_from" }
  ]
}
```

---

## K. Tests and Acceptance Criteria

### K.1 Unit Tests (`tests/unit/`)

| Test ID | Module | What is tested | Acceptance criterion |
|---------|--------|----------------|----------------------|
| U-01 | `ingest` | `source_load_log` row written for each file | `load_id` exists; `rows_raw == rows_loaded + rows_rejected` |
| U-02 | `ingest` | DQ flags set correctly on sales staging | `dq_is_duplicate = TRUE` count matches injected duplicate count ± 2% |
| U-03 | `ingest` | DQ flags set correctly on inventory staging | `dq_is_out_of_range = TRUE` count for negative `available_units` matches injection |
| U-04 | `ingest` | DQ flags set correctly on CRM staging | `dq_is_out_of_range = TRUE` for `resolved_at < created_at` cases |
| U-05 | `reconcile` | RECON-DEDUP eliminates all sales duplicates | Zero rows with `dq_is_duplicate = TRUE` in `fact_sales_daily` |
| U-06 | `reconcile` | RECON-SALES-AGG: aggregate revenue matches sum of input lines | `fact_sales_daily.net_revenue_usd` SUM for 2026-08-01 = expected ± $0.02 per test fixture |
| U-07 | `reconcile` | RECON-INV-DEDUP: negative available_units clamped to 0 | No `available_units < 0` in `fact_inventory_daily` |
| U-08 | `reconcile` | RECON-INV-DEDUP: latest snapshot hour wins on duplicate days | Exactly one row per `(date_key, sku, dc_id)` |
| U-09 | `reconcile` | RECON-OTD: on_time_pct computed correctly | For a fixture with 10 shipments, 7 on time: `on_time_pct = 0.7000` |
| U-10 | `reconcile` | RECON-FRESHNESS: freshness lag computed correctly | `actual_lag_hours` within ±0.1h of manually computed lag for test fixture |
| U-11 | `kpi` | Revenue contract SQL returns correct value for test week | `value` for test week matches a hand-computed reference value ± 0.01% |
| U-12 | `kpi` | Units sold contract SQL returns integer sum | `value` is an integer (no fractional units) |
| U-13 | `kpi` | ASP derived correctly from revenue / units | `ASP = revenue_value / units_value` within $0.01 |
| U-14 | `kpi` | Inventory availability: NULL fill_rate rows excluded from weighted average | Result unaffected by NULL fill_rate rows in test fixture |
| U-15 | `kpi` | On-time delivery: NULL shipment days not counted | `total_shipments` matches non-null ship_date count |
| U-16 | `kpi` | Customer complaints rate: zero-division guarded | Returns NULL (not error) when units_sold = 0 |
| U-17 | `kpi` | `kpi_observations` row is idempotent on re-run | Re-running KPI engine does not create duplicate observations for same period |
| U-18 | `kpi` | `contract_sql_hash` in observation matches actual SQL file hash | Hash equality check |
| U-19 | `kpi` | Freshness status written for each KPI after engine run | 7 rows in `meta.freshness_status` with correct `kpi_id` values |
| U-20 | `kpi` | DQ check results written and threshold comparison correct | Passes when null_rate < threshold; fails when null_rate > threshold |
| U-21 | `lineage` | Full lineage chain exists for revenue observation | 6 nodes, 5 edges from source CSV to observation |
| U-22 | `lineage` | Derived KPI (ASP) lineage branches correctly | Both `revenue` and `units_sold` observation nodes appear as parents |
| U-23 | `contracts` | All 7 YAML files validate against JSON schema | Zero schema validation errors |
| U-24 | `contracts` | SQL templates execute without syntax error on empty tables | No DuckDB parse/execution errors |
| U-25 | `migration` | Migration runner is idempotent | Running migrations twice does not raise errors or create duplicate tables |

### K.2 Integration Tests (`tests/integration/`)

| Test ID | Scenario | What is tested | Acceptance criterion |
|---------|----------|----------------|----------------------|
| I-01 | Baseline | Full pipeline Phase 1 on baseline seeds | All 7 KPIs produce observations; no pipeline exceptions |
| I-02 | Baseline | Revenue for 2026-W33 (baseline week) | `revenue.value` in range $1.28M–$1.42M (calibrated against seed generator) |
| I-03 | Baseline | Row counts in conformed facts | `fact_sales_daily` has ≥ 700 rows; `fact_inventory_daily` has ≥ 100,000 rows |
| I-04 | Baseline | Reconciliation runs recorded | 5 `reconciliation_runs` rows (one per source) with `status = 'ok'` or `'degraded'` |
| I-05 | Baseline | DQ scores within expected range | `dq_score` for sales ≥ 0.90; inventory ≥ 0.85; CRM ≥ 0.88 |
| I-06 | Baseline | Freshness status for all KPIs | `marketing_spend` freshness reflects known TV/radio lag; `is_within_sla` correct |
| I-07 | Baseline | API `GET /api/v1/kpis` returns 7 KPIs | Response contains exactly 7 KPI objects with `id`, `display_name`, `unit` |
| I-08 | Baseline | API `GET /api/v1/kpis/revenue/observations` | Returns time-series array; values are all numeric, no nulls in `value` column |
| I-09 | Baseline | API `GET /api/v1/kpis/revenue/lineage` | Returns 6-node lineage graph matching specification in J.5 |
| I-10 | Baseline | API `GET /api/v1/data/freshness` | Returns freshness status for all 7 KPIs with `sla_hours` and `actual_lag_hours` |
| I-11 | Baseline | API `GET /api/v1/data/quality` | Returns DQ check results; all thresholds reflected |
| I-12 | DQ stress | Force null_rate > threshold in sales fixture | `dq_check_results.passed = FALSE` for `max_null_rate` check on `revenue` |
| I-13 | Idempotency | Run full pipeline twice | Second run produces same KPI values; no duplicate observations |

### K.3 Golden Files (`tests/golden/`)

| File | Content | How used |
|------|---------|----------|
| `phase1_baseline_kpi_values.json` | Expected value, prior_value, delta_pct for each of the 7 KPIs for the baseline week (2026-W33) | `pytest --golden` compares actual vs. expected within tolerance bands |
| `phase1_reconciliation_summary.json` | Expected matched_pct and dq_score per source for baseline seed | Integration test I-05 |
| `phase1_lineage_revenue.json` | Expected full lineage graph for revenue KPI | Integration test I-09 |

Tolerance for numeric golden comparisons: ±0.1% for USD values; ±0.01pp for rates/percentages.

### K.4 Contract Tests

- Run via `pytest tests/unit/test_contracts.py`.
- Validates all 7 YAML files against `packages/contracts/schemas/kpi_contract.json`.
- Executes all SQL templates against an empty in-memory DuckDB (schema only) — must not raise exceptions.

### K.5 Phase 1 Exit Criteria

All of the following must be true before Phase 1 is declared complete:

1. All 25 unit tests pass.
2. All 13 integration tests pass.
3. All 7 KPI contract YAML files validate against JSON schema.
4. All 7 SQL templates execute without error against the seeded DuckDB.
5. `python scripts/run_pipeline.py --phase 1` completes in under 30 seconds.
6. `GET /api/v1/kpis/revenue/observations` returns a time-series with values derived exclusively from SQL (no Python arithmetic on raw values — all aggregation in SQL).
7. `GET /api/v1/kpis/revenue/lineage` returns a graph with no broken edges (all `from_node_id` and `to_node_id` values exist in `lineage_nodes`).
8. `meta.freshness_status` contains a row for each of the 7 KPIs after every pipeline run.
9. Zero Python exceptions in pipeline logs for baseline seed run.

---

## L. Implementation Tasks in Dependency Order

Tasks are grouped into five sequential milestones. No task may begin until its `depends_on` tasks are complete.

---

### Milestone L.1 — Database Infrastructure

| Task ID | Task | File(s) | Depends on |
|---------|------|---------|------------|
| L1-01 | Create DuckDB migration runner | `packages/db/duckdb/runner.py` | — |
| L1-02 | Write migration `0001_raw_schema.sql` — create all 5 `raw.*` staging tables | `packages/db/duckdb/migrations/0001_raw_schema.sql` | L1-01 |
| L1-03 | Write migration `0002_conformed_schema.sql` — create all dimension + fact tables | `packages/db/duckdb/migrations/0002_conformed_schema.sql` | L1-01 |
| L1-04 | Write migration `0003_kpi_schema.sql` — create `kpi.kpi_observations` | `packages/db/duckdb/migrations/0003_kpi_schema.sql` | L1-01 |
| L1-05 | Write migration `0004_meta_schema.sql` — create all `meta.*` tables | `packages/db/duckdb/migrations/0004_meta_schema.sql` | L1-01 |
| L1-06 | Add `DUCKDB_PATH` to `.env.example` and `pydantic-settings` config | `packages/db/duckdb/config.py`, `.env.example` | L1-01 |
| L1-07 | Write unit test: migration runner idempotency (test U-25) | `tests/unit/test_migrations.py` | L1-01, L1-02–L1-05 |

---

### Milestone L.2 — Seed Data Generator

| Task ID | Task | File(s) | Depends on |
|---------|------|---------|------------|
| L2-01 | Write `dim_sku` static reference data (80 SKUs, 5 categories) | `data/seeds/reference/dim_sku.csv` | — |
| L2-02 | Write `dim_campaign` static reference data (~25 campaigns) | `data/seeds/reference/dim_campaign.csv` | — |
| L2-03 | Write `dim_region` and `dim_distribution_center` static data | `data/seeds/reference/dim_region.csv`, `dim_distribution_center.csv` | — |
| L2-04 | Write `business_events.csv` — 120 sparse events over 24 months | `data/seeds/events/business_events.csv` | L2-01 |
| L2-05 | Write sales seed generator — produces `sales_order_lines.csv` with all DQ injections (F.1) | `scripts/generators/gen_sales.py` | L2-01, L2-02 |
| L2-06 | Write inventory seed generator — produces `inventory_snapshots.csv` with all DQ injections (F.2) | `scripts/generators/gen_inventory.py` | L2-01, L2-03 |
| L2-07 | Write CRM seed generator — produces `support_tickets.csv` with all DQ injections (F.3) | `scripts/generators/gen_crm.py` | L2-01 |
| L2-08 | Write marketing seed generator — produces `marketing_spend.csv` with all DQ injections (F.4) | `scripts/generators/gen_marketing.py` | L2-02 |
| L2-09 | Write `scripts/seed_db.py` — orchestrates all generators with fixed random seed 42 | `scripts/seed_db.py` | L2-05, L2-06, L2-07, L2-08, L2-04 |

---

### Milestone L.3 — Ingest and Reconciliation

| Task ID | Task | File(s) | Depends on |
|---------|------|---------|------------|
| L3-01 | Implement `IngestLoader` base class — file loading, SHA-256, `source_load_log` write, DQ flag injection | `packages/analytics/ingest/loader.py` | L1-02, L1-05 |
| L3-02 | Implement `SalesLoader` — loads `sales_order_lines.csv` into `raw.stg_sales_order_lines` with all DQ flags | `packages/analytics/ingest/loaders/sales.py` | L3-01 |
| L3-03 | Implement `InventoryLoader` — loads `inventory_snapshots.csv` | `packages/analytics/ingest/loaders/inventory.py` | L3-01 |
| L3-04 | Implement `CRMLoader` — loads `support_tickets.csv` | `packages/analytics/ingest/loaders/crm.py` | L3-01 |
| L3-05 | Implement `MarketingLoader` — loads `marketing_spend.csv` | `packages/analytics/ingest/loaders/marketing.py` | L3-01 |
| L3-06 | Implement `EventsLoader` — loads `business_events.csv` | `packages/analytics/ingest/loaders/events.py` | L3-01 |
| L3-07 | Implement dimension population — `dim_date` (programmatic), `dim_sku`, `dim_region`, `dim_dc`, `dim_campaign` from CSVs | `packages/analytics/ingest/dimensions.py` | L3-01, L2-01–L2-03 |
| L3-08 | Implement `ReconcileEngine` base — `reconciliation_runs` writer, orphan logger, DQ score computation | `packages/analytics/ingest/reconcile.py` | L1-03, L1-05, L3-02–L3-06 |
| L3-09 | Implement RECON-DEDUP + RECON-DATE-ALIGN + RECON-SKU-MAP as SQL executed inside `ReconcileEngine` | `packages/analytics/ingest/reconcile.py` | L3-08 |
| L3-10 | Implement RECON-SALES-AGG — populates `fact_sales_daily` | `packages/analytics/ingest/rules/sales_agg.py` | L3-09 |
| L3-11 | Implement RECON-INV-DEDUP — populates `fact_inventory_daily` | `packages/analytics/ingest/rules/inventory_dedup.py` | L3-09 |
| L3-12 | Implement RECON-OTD — populates `fact_fulfillment_daily` | `packages/analytics/ingest/rules/otd.py` | L3-09 |
| L3-13 | Implement RECON-SUPPORT-AGG — populates `fact_support_daily` | `packages/analytics/ingest/rules/support_agg.py` | L3-09 |
| L3-14 | Implement RECON-MKT-AGG — populates `fact_marketing_daily` | `packages/analytics/ingest/rules/marketing_agg.py` | L3-09 |
| L3-15 | Implement RECON-FRESHNESS — writes `meta.freshness_status` | `packages/analytics/ingest/freshness.py` | L3-08 |
| L3-16 | Write unit tests U-01 to U-10 | `tests/unit/test_ingest.py`, `tests/unit/test_reconcile.py` | L3-02–L3-15 |

---

### Milestone L.4 — KPI Contracts and Engine

| Task ID | Task | File(s) | Depends on |
|---------|------|---------|------------|
| L4-01 | Write JSON Schema for KPI contract (`kpi_contract.json`) | `packages/contracts/schemas/kpi_contract.json` | — |
| L4-02 | Write `revenue.yaml` contract + `revenue.sql` template | `packages/contracts/kpis/revenue.yaml`, `sql/revenue.sql` | L4-01 |
| L4-03 | Write `units_sold.yaml` + `units_sold.sql` | `packages/contracts/kpis/units_sold.yaml`, `sql/units_sold.sql` | L4-01 |
| L4-04 | Write `average_selling_price.yaml` (derived — no SQL template) | `packages/contracts/kpis/average_selling_price.yaml` | L4-01, L4-02, L4-03 |
| L4-05 | Write `inventory_availability.yaml` + `inventory_availability.sql` | `packages/contracts/kpis/inventory_availability.yaml`, `sql/inventory_availability.sql` | L4-01 |
| L4-06 | Write `on_time_delivery.yaml` + `on_time_delivery.sql` | `packages/contracts/kpis/on_time_delivery.yaml`, `sql/on_time_delivery.sql` | L4-01 |
| L4-07 | Write `customer_complaints.yaml` + `customer_complaints.sql` | `packages/contracts/kpis/customer_complaints.yaml`, `sql/customer_complaints.sql` | L4-01 |
| L4-08 | Write `marketing_spend.yaml` + `marketing_spend.sql` | `packages/contracts/kpis/marketing_spend.yaml`, `sql/marketing_spend.sql` | L4-01 |
| L4-09 | Implement `ContractRegistry` — loads and validates all YAML files against JSON Schema | `packages/analytics/kpi/registry.py` | L4-01–L4-08 |
| L4-10 | Implement `KPIEngine` — executes SQL contracts, handles derived KPIs, writes `kpi_observations`, checks idempotency | `packages/analytics/kpi/engine.py` | L4-09, L3-10–L3-14 |
| L4-11 | Implement `DQChecker` — reads `quality_rules` from contracts, queries conformed facts, writes `dq_check_results` | `packages/analytics/kpi/dq_checker.py` | L4-09, L3-10–L3-14 |
| L4-12 | Implement `LineageWriter` — builds and writes the full DAG for each `kpi_observation` | `packages/analytics/kpi/lineage.py` | L4-10, L1-05 |
| L4-13 | Write unit tests U-11 to U-25 | `tests/unit/test_kpi.py`, `tests/unit/test_contracts.py`, `tests/unit/test_lineage.py` | L4-10–L4-12 |
| L4-14 | Generate golden files from first successful baseline run | `tests/golden/phase1_baseline_kpi_values.json`, `tests/golden/phase1_reconciliation_summary.json`, `tests/golden/phase1_lineage_revenue.json` | L4-10, L3-10 |

---

### Milestone L.5 — Pipeline CLI and API Endpoints

| Task ID | Task | File(s) | Depends on |
|---------|------|---------|------------|
| L5-01 | Write `scripts/run_pipeline.py` — orchestrates ingest → reconcile → KPI → DQ → lineage; `--phase 1` flag | `scripts/run_pipeline.py` | L3-08–L3-15, L4-10–L4-12 |
| L5-02 | Add `GET /api/v1/kpis` endpoint — returns list of all KPI contracts | `apps/api/routers/kpis.py` | L4-09 |
| L5-03 | Add `GET /api/v1/kpis/{kpi_id}/observations` — returns time-series from `kpi_observations` | `apps/api/routers/kpis.py` | L4-10 |
| L5-04 | Add `GET /api/v1/kpis/{kpi_id}/lineage` — returns lineage DAG JSON | `apps/api/routers/kpis.py` | L4-12 |
| L5-05 | Add `GET /api/v1/data/freshness` — returns `freshness_status` for all KPIs | `apps/api/routers/data.py` | L3-15 |
| L5-06 | Add `GET /api/v1/data/quality` — returns `dq_check_results` | `apps/api/routers/data.py` | L4-11 |
| L5-07 | Register new routers in `apps/api/main.py` | `apps/api/main.py` | L5-02–L5-06 |
| L5-08 | Write Pydantic response models for all new endpoints | `apps/api/schemas/kpis.py`, `apps/api/schemas/data.py` | L5-02–L5-06 |
| L5-09 | Write integration tests I-01 to I-13 | `tests/integration/test_phase1_pipeline.py`, `tests/integration/test_phase1_api.py` | L5-01, L5-02–L5-06 |

---

### Dependency Summary (critical path)

```
L1-01 ──► L1-02–L1-06 ──► L3-01 ──► L3-02–L3-07 ──► L3-08–L3-09 ──► L3-10–L3-15
                                                                              │
L2-01–L2-09 ──────────────────────────────────────────────────────────────────┘
                                                                              │
                                                                        L4-09–L4-14
                                                                              │
                                                                        L5-01–L5-09
```

Total tasks: **48**  
Estimated implementation time: **8–10 focused working days**

---

*Specification version: 1.0 — Phase 1 Data Foundation*  
*Author: NEXUS.ai team*  
*Created: 2026-08-23*  
*Reference: docs/ARCHITECTURE.md v1.0*
