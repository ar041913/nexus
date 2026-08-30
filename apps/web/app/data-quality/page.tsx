"use client";

import { sectionClassName, PanelHeader, SkeletonBlock, confidenceTone } from "@/lib/dashboard-utils";
import { useDashboardParams } from "@/lib/use-dashboard-params";
import { HeartPulse } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type FreshnessRow, type Insight, type Persona } from "@/lib/api";
import { cn } from "@/lib/utils";

type DashboardInsight = Insight & { persona: Persona };

export default function DataQualityPage() {
  const { scenario, persona } = useDashboardParams();
  const [insight, setInsight] = useState<DashboardInsight | null>(null);
  const [freshness, setFreshness] = useState<FreshnessRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      try {
        const [result, fresh] = await Promise.all([
          api.insight(scenario, persona, { signal: controller.signal }),
          api.freshness({ signal: controller.signal }),
        ]);
        if (!cancelled) {
          setInsight({ ...result, persona });
          setFreshness(fresh);
        }
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

  if (loading) return <SkeletonBlock className="h-96 w-full" />;
  if (!insight) {
    return <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-5 text-rose-100">No insight data available</div>;
  }

  const tone = confidenceTone(insight.confidence.overall);

  return (
    <div className="space-y-6">
      <section className={sectionClassName() + " p-5"}>
        <PanelHeader
          eyebrow="DATA QUALITY"
          title="Source health, grain, and cadence"
          description="Each source has its own grain and refresh lag (sales T+1 daily, inventory hourly rollup, CRM 06:00 UTC, marketing weekly)."
          icon={<HeartPulse className="h-5 w-5" />}
        />
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-end gap-4">
              <div className={cn("flex h-24 w-24 items-center justify-center rounded-full border text-3xl font-semibold ring-1", tone.chip)}>
                {Math.round(insight.confidence.overall * 100)}%
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Trust signal</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">Deterministic fusion of quality, freshness, stats, and evidence coverage.</p>
              </div>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
            {([
              ["data_quality", "Data Quality"],
              ["freshness", "Freshness"],
              ["stat_strength", "Statistical Strength"],
              ["evidence_coverage", "Evidence Coverage"],
            ] as const).map(([key, label]) => {
              const value = insight.confidence.components[key];
              return (
                <div key={key} className="mb-4 last:mb-0">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-medium text-white">{Math.round(value * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-900/80">
                    <div className={cn("h-2 rounded-full", tone.bar)} style={{ width: `${(value * 100).toFixed(0)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={sectionClassName() + " p-5"}>
        <h3 className="text-lg font-semibold text-white">KPI contracts — grain and freshness SLA</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
            <thead className="text-xs uppercase tracking-widest text-slate-500">
              <tr>
                <th className="pb-2">KPI</th>
                <th className="pb-2">Source</th>
                <th className="pb-2">Grain</th>
                <th className="pb-2">Cadence</th>
                <th className="pb-2">Lag / SLA</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {freshness.map((row) => (
                <tr key={`${row.kpi_id}-${row.source_name}`} className="border-t border-white/10">
                  <td className="py-2 font-medium text-white">{row.kpi_id}</td>
                  <td>{row.source_name}</td>
                  <td>{row.grain}</td>
                  <td>{row.cadence}</td>
                  <td>{row.actual_lag_hours}h / {row.sla_hours}h</td>
                  <td className={row.is_within_sla ? "text-emerald-300" : "text-amber-300"}>
                    {row.is_within_sla ? "Within SLA" : "Lag warning"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
