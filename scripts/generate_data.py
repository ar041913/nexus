"""
NovaMart synthetic data generator.
Produces sales.csv, inventory.csv, support.csv with ~6 months of daily data.
Embeds a revenue decline in the final 3 weeks driven by inventory, support, and volume.
Run: python scripts/generate_data.py
"""

import random
import csv
import os
from datetime import date, timedelta
from pathlib import Path

SEED = 42
random.seed(SEED)

# ── date range ────────────────────────────────────────────────────────────────
START = date(2026, 2, 1)
END   = date(2026, 8, 7)        # "current" week ends here
DECLINE_START = date(2026, 7, 18)  # ~3 weeks of decline before END

DAYS = [START + timedelta(d) for d in range((END - START).days + 1)]

# ── reference data ────────────────────────────────────────────────────────────
SKUS = [
    ("NOVA-AUD-01", "audio",      "Wireless Headphones Pro",   149.99, 52.00),
    ("NOVA-AUD-02", "audio",      "True Wireless Earbuds",      89.99, 28.00),
    ("NOVA-MOB-01", "mobile",     "Nova Phone 15",             699.99,210.00),
    ("NOVA-MOB-02", "mobile",     "Nova Phone 15 Lite",        449.99,135.00),
    ("NOVA-CPT-01", "computing",  "Nova Laptop Air",           999.99,320.00),
    ("NOVA-CPT-02", "computing",  "Nova Tab S",                399.99,110.00),
    ("NOVA-WBL-01", "wearables",  "Nova Watch Ultra",          299.99, 88.00),
    ("NOVA-WBL-02", "wearables",  "Nova Band 5",                79.99, 22.00),
    ("NOVA-ACC-01", "accessories","Nova Case Bundle",            29.99,  7.00),
    ("NOVA-ACC-02", "accessories","Nova Charging Dock",          49.99, 14.00),
    # new sparse product — launched 2026-07-20
    ("NOVA-AUD-X1", "audio",      "Nova Buds X1 (new)",        119.99, 38.00),
]
REGIONS = ["North", "South", "East", "West"]
CHANNELS = ["online", "marketplace", "b2b"]

# base daily units per sku (before region/channel split)
BASE_UNITS = {
    "NOVA-AUD-01": 28, "NOVA-AUD-02": 35, "NOVA-MOB-01": 18,
    "NOVA-MOB-02": 22, "NOVA-CPT-01": 12, "NOVA-CPT-02": 15,
    "NOVA-WBL-01": 20, "NOVA-WBL-02": 30, "NOVA-ACC-01": 55,
    "NOVA-ACC-02": 40, "NOVA-AUD-X1":  0,  # sparse until launch
}

REGION_WEIGHTS = {"North": 0.28, "South": 0.22, "East": 0.27, "West": 0.23}
CHANNEL_WEIGHTS = {"online": 0.55, "marketplace": 0.30, "b2b": 0.15}

DATA_DIR = Path(__file__).parent.parent / "data" / "seeds"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── helpers ───────────────────────────────────────────────────────────────────
def jitter(val, pct=0.12):
    return val * (1 + random.uniform(-pct, pct))

def decline_factor(d):
    """Returns 1.0 before decline, ramps down to ~0.93 at END (~7% max drop).
    Across the current window (days 10-20 of a 20-day decline) the average
    factor is ~0.95, producing ~5% unit decline which with a small ASP effect
    combines to ~8% revenue decline."""
    if d < DECLINE_START:
        return 1.0
    days_in = (d - DECLINE_START).days
    total   = (END - DECLINE_START).days
    return 1.0 - 0.07 * (days_in / total)

def inv_decline_factor(d):
    """Fill rate declines sharper during decline period."""
    if d < DECLINE_START:
        return 1.0
    days_in = (d - DECLINE_START).days
    total   = (END - DECLINE_START).days
    return 1.0 - 0.18 * (days_in / total)

# ── SALES ─────────────────────────────────────────────────────────────────────
print("Generating sales.csv …")
sales_rows = []
for d in DAYS:
    dfactor = decline_factor(d)
    for sku, cat, name, price, cost in SKUS:
        # sparse product only active from 2026-07-20
        if sku == "NOVA-AUD-X1" and d < date(2026, 7, 20):
            continue
        base = BASE_UNITS.get(sku, 10)
        if sku == "NOVA-AUD-X1":
            base = 8  # small volumes, new product
        for region in REGIONS:
            for channel in CHANNELS:
                raw_units = base * REGION_WEIGHTS[region] * CHANNEL_WEIGHTS[channel] * dfactor
                units = max(0, int(jitter(raw_units, 0.20)))
                if units == 0:
                    continue
                # discount increases slightly during decline — small ramp keeps ASP
                # change muted so volume remains the dominant driver
                base_discount = 0.05 if channel != "b2b" else 0.10
                if d >= DECLINE_START:
                    extra_discount = 0.015 * ((d - DECLINE_START).days / (END - DECLINE_START).days)
                else:
                    extra_discount = 0.0
                discount = round(base_discount + extra_discount + random.uniform(-0.01, 0.01), 4)
                net_revenue = round(units * price * (1 - discount), 2)
                sales_rows.append({
                    "date": d.isoformat(),
                    "sku": sku,
                    "category": cat,
                    "region": region,
                    "channel": channel,
                    "units": units,
                    "list_price_usd": price,
                    "discount_pct": discount,
                    "net_revenue_usd": net_revenue,
                })

with open(DATA_DIR / "sales.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=sales_rows[0].keys())
    w.writeheader()
    w.writerows(sales_rows)
print(f"  {len(sales_rows):,} rows → data/seeds/sales.csv")

# ── INVENTORY ─────────────────────────────────────────────────────────────────
print("Generating inventory.csv …")
inv_rows = []
DCS = ["DC-NORTH", "DC-SOUTH", "DC-EAST", "DC-WEST"]
DC_REGION = {"DC-NORTH": "North", "DC-SOUTH": "South", "DC-EAST": "East", "DC-WEST": "West"}

for d in DAYS:
    ifactor = inv_decline_factor(d)
    for sku, cat, name, price, cost in SKUS:
        if sku == "NOVA-AUD-X1" and d < date(2026, 7, 20):
            continue
        for dc in DCS:
            base_stock = BASE_UNITS.get(sku, 10) * 14  # ~14 days buffer
            if sku == "NOVA-AUD-X1":
                base_stock = 60
            on_hand = max(0, int(jitter(base_stock * ifactor, 0.15)))
            allocated = max(0, int(on_hand * random.uniform(0.25, 0.45)))
            available = max(0, on_hand - allocated)
            # fill rate degrades during decline — base 90% prior, drops to ~72% at peak decline
            # This keeps the operational driver story strong even with a smaller revenue drop
            if d >= DECLINE_START:
                days_in = (d - DECLINE_START).days
                total_days = (END - DECLINE_START).days
                base_fill = 0.90 - 0.18 * (days_in / total_days)
            else:
                base_fill = 0.90
            fill_rate = round(min(1.0, max(0.0, jitter(base_fill * ifactor, 0.06))), 4)
            inv_rows.append({
                "date": d.isoformat(),
                "sku": sku,
                "dc_id": dc,
                "region": DC_REGION[dc],
                "on_hand_units": on_hand,
                "allocated_units": allocated,
                "available_units": available,
                "fill_rate": fill_rate,
            })

with open(DATA_DIR / "inventory.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=inv_rows[0].keys())
    w.writeheader()
    w.writerows(inv_rows)
print(f"  {len(inv_rows):,} rows → data/seeds/inventory.csv")

# ── SUPPORT TICKETS ───────────────────────────────────────────────────────────
print("Generating support.csv …")
support_rows = []
CATEGORIES = ["late_delivery", "wrong_item", "damaged", "billing", "product_defect", "other"]
CAT_WEIGHTS = [0.35, 0.15, 0.12, 0.10, 0.18, 0.10]
SEVERITIES  = ["low", "medium", "high", "critical"]
SEV_WEIGHTS = [0.40, 0.35, 0.18, 0.07]

tid = 1
for d in DAYS:
    # ticket volume spikes during decline (late delivery complaints)
    if d >= DECLINE_START:
        days_in = (d - DECLINE_START).days
        total   = (END - DECLINE_START).days
        base_tickets = int(18 + 22 * (days_in / total))  # 18 → 40 per day
    else:
        base_tickets = int(jitter(14, 0.20))

    for _ in range(base_tickets):
        cat = random.choices(CATEGORIES, CAT_WEIGHTS)[0]
        sev = random.choices(SEVERITIES, SEV_WEIGHTS)[0]
        # late_delivery spikes more during decline
        if d >= DECLINE_START and cat != "late_delivery":
            if random.random() < 0.40:
                cat = "late_delivery"
        sku_pool = [s[0] for s in SKUS if s[0] != "NOVA-AUD-X1" and s[1] != "accessories"]
        sku = random.choice(sku_pool) if cat not in ("billing", "other") else None
        region = random.choices(REGIONS, list(REGION_WEIGHTS.values()))[0]
        resolution_days = round(random.uniform(0.5, 7.0), 1) if random.random() > 0.15 else None
        support_rows.append({
            "ticket_id": f"TKT-{d.strftime('%Y%m%d')}-{tid:05d}",
            "date": d.isoformat(),
            "category": cat,
            "severity": sev,
            "sku": sku or "",
            "region": region,
            "resolution_days": resolution_days if resolution_days else "",
        })
        tid += 1

with open(DATA_DIR / "support.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=support_rows[0].keys())
    w.writeheader()
    w.writerows(support_rows)
print(f"  {len(support_rows):,} rows → data/seeds/support.csv")
print("Done.")
