SELECT COALESCE(SUM(units_sold), 0) AS value
FROM fact_sales_daily
WHERE date BETWEEN ? AND ?
