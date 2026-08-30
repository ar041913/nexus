SELECT COALESCE(AVG(avg_fill_rate), 0) AS value
FROM fact_inventory_daily
WHERE date BETWEEN ? AND ?
  AND avg_fill_rate IS NOT NULL
