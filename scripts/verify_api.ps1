Start-Sleep -Seconds 6

Write-Host "=== /health ==="
$h = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing
Write-Host $h.Content

Write-Host "`n=== /api/kpis (revenue_decline) ==="
$k = Invoke-WebRequest -Uri "http://localhost:8000/api/kpis?scenario=revenue_decline" -UseBasicParsing
$kpis = $k.Content | ConvertFrom-Json
Write-Host "Count: $($kpis.Count)"
foreach ($kpi in $kpis) {
    Write-Host "  $($kpi.kpi_id): current=$($kpi.current) delta_pct=$($kpi.delta_pct)%"
}

Write-Host "`n=== /api/insights/current (CFO, revenue_decline) ==="
$i = Invoke-WebRequest -Uri "http://localhost:8000/api/insights/current?scenario=revenue_decline&persona=cfo" -UseBasicParsing
$ins = $i.Content | ConvertFrom-Json
Write-Host "  insight_id: $($ins.insight_id)"
Write-Host "  confidence: $($ins.confidence.overall) [$($ins.confidence.bucket)]"
Write-Host "  signals: $($ins.signals.Count)  drivers: $($ins.drivers.Count)  actions: $($ins.actions.Count)"
Write-Host "  abstention: $($ins.abstention)"
Write-Host "  narrative: $($ins.narrative.Substring(0, [Math]::Min(150, $ins.narrative.Length)))..."

Write-Host "`n=== Actions CFO vs SCM ==="
$ca = (Invoke-WebRequest -Uri "http://localhost:8000/api/actions?scenario=revenue_decline&persona=cfo" -UseBasicParsing).Content | ConvertFrom-Json
$sa = (Invoke-WebRequest -Uri "http://localhost:8000/api/actions?scenario=revenue_decline&persona=supply_chain_manager" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "  CFO: $($ca.actions | ForEach-Object { $_.action_id } | Join-String -Separator ', ')"
Write-Host "  SCM: $($sa.actions | ForEach-Object { $_.action_id } | Join-String -Separator ', ')"

Write-Host "`n=== Sparse History Abstention ==="
$sp = (Invoke-WebRequest -Uri "http://localhost:8000/api/insights/current?scenario=sparse_history&persona=cfo" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "  verdict: $($sp.abstention.verdict)  reason: $($sp.abstention.reason)  data_days: $($sp.abstention.data_days)"

Write-Host "`n=== Contradictory Abstention ==="
$ct = (Invoke-WebRequest -Uri "http://localhost:8000/api/insights/current?scenario=contradictory&persona=cfo" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "  verdict: $($ct.abstention.verdict)  reason: $($ct.abstention.reason)"
Write-Host "  hypotheses: $($ct.abstention.competing_hypotheses.Count)"

Write-Host "`n=== Feedback POST ==="
$fb = Invoke-WebRequest -Uri "http://localhost:8000/api/feedback" -Method POST -ContentType "application/json" -Body '{"insight_id":"test","persona":"cfo","rating":"helpful","comment":"Good","action_taken":"act_inv_realloc"}' -UseBasicParsing
Write-Host $fb.Content

Write-Host "`nAll checks complete."
