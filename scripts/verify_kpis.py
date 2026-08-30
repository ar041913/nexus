"""Quick KPI verification after calibration."""
import sys
sys.path.insert(0, ".")
from packages.analytics.engine import get_conn, load_data, compute_kpis, SCENARIOS

cfg = SCENARIOS["revenue_decline"]
conn = get_conn()
load_data(conn)
kpis = compute_kpis(conn, cfg["current_start"], cfg["current_end"],
                    cfg["prior_start"], cfg["prior_end"])
conn.close()

print("=" * 56)
print(f"{'KPI':<30} {'Current':>10} {'Prior':>10} {'Delta %':>8}")
print("-" * 56)
for k in kpis:
    sign = "↓" if k["delta_pct"] < 0 else "↑"
    print(f"{k['name']:<30} {k['current']:>10.3f} {k['prior']:>10.3f} {sign}{abs(k['delta_pct']):>6.2f}%")
print("=" * 56)

rev = next(k for k in kpis if k["kpi_id"] == "revenue")
inv = next(k for k in kpis if k["kpi_id"] == "inventory_availability")
cmp = next(k for k in kpis if k["kpi_id"] == "customer_complaints")

ok = -9.0 <= rev["delta_pct"] <= -7.0
print(f"\nRevenue in target range [-9%, -7%]: {'✓ YES' if ok else '✗ NO'}  ({rev['delta_pct']:.2f}%)")
print(f"Inventory declined:  {'✓ YES' if inv['delta_pct'] < -5 else '✗ NO'}  ({inv['delta_pct']:.2f}%)")
print(f"Complaints increased: {'✓ YES' if cmp['delta_pct'] > 50 else '✗ NO'}  (+{cmp['delta_pct']:.1f}%)")
