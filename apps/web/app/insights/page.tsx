"use client";

import { sectionClassName, PanelHeader, SkeletonBlock } from "@/lib/dashboard-utils";
import { useDashboardParams } from "@/lib/use-dashboard-params";
import { BarChart3, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Insight, type Persona } from "@/lib/api";

type DashboardInsight = Insight & { persona: Persona };

export default function InsightsPage() {
  const { scenario, persona } = useDashboardParams();
  const [insight, setInsight] = useState<DashboardInsight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      try {
        const result = await api.insight(scenario, persona, { signal: controller.signal });
        if (!cancelled) setInsight({ ...result, persona });
      } catch (err) {
        if (!cancelled) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scenario, persona]);

  if (loading) {
    return <SkeletonBlock className="h-96 w-full" />;
  }

  if (!insight) {
    return <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-5 text-rose-100">No insight data available</div>;
  }

  return (
    <div className="space-y-6">
      <section className={sectionClassName() + " p-5"}>
        <PanelHeader
          eyebrow="ANALYTICAL INSIGHTS"
          title="Driver Analysis"
          description="Ranked real drivers from the backend, with contribution bars for decomposition and association bars where the backend returned correlation instead of causal contribution."
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <div className="space-y-3">
          {insight.drivers.map((driver, index) => (
            <div key={driver.driver_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">
                {index + 1}. {driver.label}
              </p>
              <p className="text-xs text-slate-400 mt-1">{driver.method}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClassName() + " p-5"}>
        <PanelHeader
          eyebrow="EVIDENCE"
          title="Key Evidence"
          description="Every evidence item returned by the API is shown as a source-backed card with finding, value, method, and freshness/timestamp."
          icon={<Database className="h-5 w-5" />}
        />
        <div className="grid gap-3 xl:grid-cols-2">
          {insight.evidence.map((evidence) => (
            <div key={evidence.ev_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-white">{evidence.finding}</p>
              <p className="text-xs text-slate-400 mt-2">{evidence.source}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
