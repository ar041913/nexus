# Contracts

Versioned KPI semantic contracts (YAML) and a JSON Schema shared across the analytics pipeline and API.

This repo ships **7 KPI contracts** under `packages/contracts/kpis/`:

| KPI | Grain (default) | Formula | Access |
|---|---|---|---|
| revenue | day | SQL | CFO, SCM, analyst |
| units_sold | day | SQL | CFO, SCM, analyst |
| average_selling_price | week | derived (revenue / units) | CFO, SCM, analyst |
| inventory_availability | day | SQL | CFO, SCM, analyst |
| on_time_delivery | week | SQL | CFO, SCM, analyst |
| customer_complaints | week | SQL | CFO, SCM, analyst |
| marketing_spend | week | SQL | CFO, analyst (SCM masked) |

Contracts are validated against `packages/contracts/schemas/kpi_contract.json` on load.
