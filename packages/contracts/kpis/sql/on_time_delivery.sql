SELECT COALESCE(SUM(on_time_shipments) * 1.0 / NULLIF(SUM(shipments), 0), 0) AS value
FROM fact_fulfillment_daily
WHERE date BETWEEN ? AND ?
