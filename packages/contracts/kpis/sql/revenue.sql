SELECT COALESCE(SUM(net_revenue_usd), 0) AS value
FROM fact_sales_daily
WHERE date BETWEEN ? AND ?
