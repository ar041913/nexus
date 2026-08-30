import sys
sys.path.insert(0, ".")

from apps.api.routers import kpis, insights

print("kpis router routes:")
for r in kpis.router.routes:
    print(f"  {getattr(r, 'methods', '?')} {r.path}")

print("insights router routes:")
for r in insights.router.routes:
    print(f"  {getattr(r, 'methods', '?')} {r.path}")

from apps.api.main import app
print("\napp routes after include:")
for r in app.routes:
    name = type(r).__name__
    path = getattr(r, "path", "(nested)")
    methods = getattr(r, "methods", None)
    if methods:
        print(f"  {','.join(sorted(methods))} {path}")
    else:
        print(f"  {name}: {path}")
        for sub in getattr(r, "routes", []):
            smethods = getattr(sub, "methods", None)
            spath = getattr(sub, "path", "")
            if smethods:
                print(f"    {','.join(sorted(smethods))} {spath}")
