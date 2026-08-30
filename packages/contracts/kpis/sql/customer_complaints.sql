SELECT COALESCE(COUNT(*), 0) * 1000.0 / NULLIF((
    SELECT SUM(units_sold) FROM fact_sales_daily WHERE date BETWEEN ? AND ?
), 0) AS value
FROM stg_support
WHERE date BETWEEN ? AND ?
