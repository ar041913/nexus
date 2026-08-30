"use client";

import { sectionClassName, PanelHeader, SkeletonBlock, Chip, formatDelta } from "@/lib/dashboard-utils";
import { useDashboardParams } from "@/lib/use-dashboard-params";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Insight, type Persona, type SimulationResult } from "@/lib/api";
import { Button } from "@/components/ui/button";

type DashboardInsight = Insight & { persona: Persona };

export default function SimulationPage() {
  const { scenario, persona } = useDashboardParams();
  const [insight, setInsight] = useState<DashboardInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setResult(null);
      try {
        const payload = await api.insight(scenario, persona, { signal: controller.signal });
        if (cancelled) return;
        setInsight({ ...payload, persona });
        const next: Record<string, number> = {};
        for (const action of payload.actions) next[action.action_id] = 1;
        setMultipliers(next);
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

  const adjustments = useMemo(
    () => Object.entries(multipliers).map(([action_id, delta_multiplier]) => ({ action_id, delta_multiplier })),
    [multipliers],
  );

  async function runSimulate() {
    if (!insight) return;
    setSimulating(true);
    try {
      const payload = await api.simulate({ scenario, persona, lever_adjustments: adjustments });
      setResult(payload);
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  }

  if (loading) return <SkeletonBlock className="h-96 w-full" />;
  if (!insight) {
    return <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-5 text-rose-100">No insight data available</div>;
  }

  return (
    <div className="space-y-6">
      <section className={sectionClassName() + " p-5"}>
        <PanelHeader
          eyebrow="SIMULATION"
          title="Decision levers"
          description="POST /api/simulate applies a deterministic delta-multiplier to each lever. Numbers come from the action library, not the LLM."
          icon={<SlidersHorizontal className="h-5 w-5" />}
        />
        {insight.abstention ? (
          <div className="rounded-xl border border-amber-400/15 bg-amber-500/10 p-5 text-amber-50">
            <p className="font-semibold">Simulation unavailable</p>
            <p className="text-sm mt-2">{insight.abstention.message}</p>
          </div>
        ) : insight.actions.length ? (
          <div className="space-y-4">
            {insight.actions.map((action) => (
              <div key={action.action_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.lever}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.owner}</Chip>
                  {action.action_id === "act_approve_expedite" && persona === "cfo" ? (
                    <Chip className="border-amber-400/20 bg-amber-500/10 text-amber-100">Approval required</Chip>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-white">{action.action}</p>
                <p className="mt-2 text-xs text-slate-400">Baseline impact: {action.expected_impact}</p>
                <label className="mt-4 flex items-center gap-3 text-sm text-slate-300">
                  <span className="w-36 shrink-0">Intensity {multipliers[action.action_id]?.toFixed(1)}×</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={multipliers[action.action_id] ?? 1}
                    onChange={(event) =>
                      setMultipliers((current) => ({ ...current, [action.action_id]: Number(event.target.value) }))
                    }
                    className="w-full accent-cyan-400"
                  />
                </label>
              </div>
            ))}
            <Button type="button" onClick={runSimulate} disabled={simulating} className="rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              {simulating ? "Simulating…" : "Simulate outcomes"}
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            No action candidates were returned for this scenario.
          </div>
        )}
      </section>

      {result ? (
        <section className={sectionClassName() + " p-5"}>
          <PanelHeader
            eyebrow="OUTCOMES"
            title="Risk, cost, and KPI movement"
            description={`${result.method} · $${result.total_cost_usd.toLocaleString()} estimated cost · ${result.time_to_effect_days} days to effect`}
            icon={<SlidersHorizontal className="h-5 w-5" />}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.kpi_impacts.map((kpi) => (
              <div key={kpi.kpi_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">{kpi.name}</p>
                <p className="mt-2 text-xs text-slate-400">Baseline {formatDelta(kpi.baseline_delta_pct)}</p>
                <p className="mt-1 text-lg font-semibold text-cyan-100">Simulated {formatDelta(kpi.simulated_delta_pct)}</p>
                <p className="mt-1 text-xs text-slate-400">Recovery {kpi.recovery_pp > 0 ? "+" : ""}{kpi.recovery_pp.toFixed(1)} pp</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1 text-xs text-slate-400">
            {result.assumptions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
