"use client";

import { sectionClassName, PanelHeader, SkeletonBlock, Chip } from "@/lib/dashboard-utils";
import { useDashboardParams } from "@/lib/use-dashboard-params";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Insight, type Persona } from "@/lib/api";
import { cn } from "@/lib/utils";

type DashboardInsight = Insight & { persona: Persona };

export default function ActionsPage() {
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
          eyebrow="ACTION"
          title="Recommended Actions"
          description="The backend returns the lever and action for the selected persona. This view preserves that recommendation and makes the decision flow explicit."
          icon={<Sparkles className="h-5 w-5" />}
        />
        {insight.abstention ? (
          <div className="rounded-xl border border-amber-400/15 bg-amber-500/10 p-5 text-amber-50">
            <p className="font-semibold">{insight.abstention.verdict}</p>
            <p className="text-sm mt-2">{insight.abstention.message}</p>
          </div>
        ) : insight.actions.length ? (
          <div className="space-y-3">
            {insight.actions.map((action, index) => (
              <article key={action.action_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mb-3">
                  <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">{String(index + 1).padStart(2, "0")}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.driver_label}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.lever}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.owner}</Chip>
                  <Chip
                    className={cn(
                      "ring-1",
                      action.confidence >= 0.75
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                        : "border-amber-400/20 bg-amber-500/10 text-amber-100"
                    )}
                  >
                    {Math.round(action.confidence * 100)}% confidence
                  </Chip>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Driver → Lever → Action → Owner</p>
                  <p className="mt-2 text-sm leading-6 text-white">{action.action}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3 mt-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Expected impact</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-100">{action.expected_impact}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Confidence</p>
                    <p className="mt-1 text-sm font-semibold text-white">{Math.round(action.confidence * 100)}%</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Priority</p>
                    <p className="mt-1 text-sm font-semibold text-white capitalize">{action.priority}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            No recommendation returned for this persona.
          </div>
        )}
      </section>
    </div>
  );
}
