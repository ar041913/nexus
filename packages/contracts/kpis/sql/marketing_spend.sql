SELECT COALESCE(SUM(spend_usd), 0) AS value
FROM fact_marketing_daily
WHERE date BETWEEN ? AND ?
