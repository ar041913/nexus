"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Target } from "lucide-react";
import { api, type Insight, type KPI, type Persona, type TimePoint } from "@/lib/api";
import { useDashboardParams } from "@/lib/use-dashboard-params";
import {
  PanelHeader,
  sectionClassName,
  SkeletonBlock,
  formatValue,
  formatDelta,
  formatDate,
  formatMoney,
  formatDateTime,
  statusTone,
  confidenceTone,
  isAdverse,
  signalForKpi,
  Chip,
} from "@/lib/dashboard-utils";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DashboardInsight = Insight & { persona: Persona };

export default function OverviewPage() {
  const { scenario, persona } = useDashboardParams();
  const [insight, setInsight] = useState<DashboardInsight | null>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<string>("revenue");
  const [sparkCache, setSparkCache] = useState<Record<string, TimePoint[]>>({});
  const [sparkErrors, setSparkErrors] = useState<Record<string, string | null>>({});
  const sparkInFlight = useRef<Set<string>>(new Set());

  const selectedKpi = useMemo(() => kpis.find((item) => item.kpi_id === activeKpi) ?? kpis[0] ?? null, [activeKpi, kpis]);

  useEffect(() => {
    if (!selectedKpi && kpis[0]) {
      setActiveKpi(kpis[0].kpi_id);
    }
  }, [kpis, selectedKpi]);

  // Load insight and KPIs
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError(null);
      setInsight(null);
      setKpis([]);
      setSparkCache({});
      setSparkErrors({});

      try {
        const insightResult = await api.insight(scenario, persona, { signal: controller.signal });
        if (cancelled) return;
        setInsight({ ...insightResult, persona });
      } catch (reason) {
        if (!cancelled && reason instanceof Error && !reason.message.includes("aborted")) {
          setError(String(reason));
        }
      }

      try {
        const kpiResult = await api.kpis(scenario, persona, { signal: controller.signal });
        if (cancelled) return;
        setKpis(kpiResult);
        setActiveKpi((current) => {
          const match = kpiResult.find((item) => item.kpi_id === current);
          return match ? current : "revenue";
        });
      } catch (reason) {
        if (!cancelled && reason instanceof Error && !reason.message.includes("aborted")) {
          setError(String(reason));
        }
      }

      setLoading(false);
    }

    loadData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scenario, persona]);

  // Load timeseries
  useEffect(() => {
    if (!kpis.length) return;

    let cancelled = false;
    const controller = new AbortController();

    async function loadSeriesQueue() {
      const queue = [...kpis].sort((left, right) => {
        if (left.kpi_id === "revenue") return -1;
        if (right.kpi_id === "revenue") return 1;
        return 0;
      });

      for (const kpi of queue) {
        if (cancelled || controller.signal.aborted) return;
        if (sparkCache[kpi.kpi_id] || sparkInFlight.current.has(kpi.kpi_id)) continue;

        sparkInFlight.current.add(kpi.kpi_id);
        try {
          const data = await api.timeseries(kpi.kpi_id, 90, { signal: controller.signal });
          if (cancelled || controller.signal.aborted) return;
          setSparkCache((current) => ({ ...current, [kpi.kpi_id]: data }));
          setSparkErrors((current) => ({ ...current, [kpi.kpi_id]: null }));
        } catch (reason) {
          if (!cancelled && !controller.signal.aborted) {
            const errorMsg = reason instanceof Error ? reason.message : String(reason);
            if (!errorMsg.includes("aborted") && !errorMsg.includes("cancel")) {
              setSparkErrors((current) => ({ ...current, [kpi.kpi_id]: errorMsg }));
            }
          }
        } finally {
          sparkInFlight.current.delete(kpi.kpi_id);
        }
      }
    }

    loadSeriesQueue();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [kpis, scenario]);

  const revenueSeries = sparkCache.revenue;
  const chartLoading = loading && !revenueSeries;
  const chartError = sparkErrors.revenue;

  if (loading && !insight) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          <SkeletonBlock className="h-[360px] w-full" />
          <SkeletonBlock className="h-[280px] w-full" />
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-[360px] w-full" />
        </div>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-100">
        {error ? `Error: ${error}` : "No insight could be loaded."}
      </div>
    );
  }

  const revenue = insight.kpis.find((item) => item.kpi_id === "revenue");
  const revenueSignal = signalForKpi(insight.signals, "revenue");
  const adverse = revenue ? isAdverse(revenue) : false;
  const confidence = confidenceTone(insight.confidence.overall);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.18),transparent_40%),linear-gradient(135deg,rgba(2,6,23,0.95),rgba(11,16,31,0.95))] p-5 shadow-[0_28px_100px_rgba(2,8,23,0.5)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip className="border-white/10 bg-white/5 text-slate-200">{insight.scenario_label}</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">{persona === "cfo" ? "CFO" : "Supply Chain Manager"}</Chip>
              {insight.access?.note ? <Chip className="border-white/10 bg-white/5 text-slate-200">{insight.access.note}</Chip> : null}
              <Chip className="border-white/10 bg-white/5 text-slate-200">Insight {insight.insight_id}</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">{formatDateTime(insight.generated_at)}</Chip>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-100/80">Revenue Decline Insight</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Revenue {revenue ? (revenue.delta_pct < 0 ? "↓" : "↑") : "—"} {revenue ? Math.abs(revenue.delta_pct).toFixed(1) : "—"}%
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Material KPI movement detected. The dashboard is driven by the backend real insight payload, KPI calculations, driver analysis, and evidence trail.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[430px] lg:grid-cols-1">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Current revenue</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{revenue ? formatValue(revenue.current, revenue.unit) : "—"}</p>
                  <p className="mt-1 text-sm text-slate-400">Previous {revenue ? formatValue(revenue.prior, revenue.unit) : "—"}</p>
                </div>
                <div className={cn("rounded-2xl px-3 py-2 text-right ring-1", statusTone(Boolean(revenue && adverse), revenueSignal?.severity))}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{revenueSignal?.material ? "Material" : "Stable"}</p>
                  <p className="mt-1 text-sm font-semibold">Severity {revenueSignal?.severity ?? "n/a"}</p>
                  {revenue && <p className={cn("mt-1 text-sm font-semibold", adverse ? "text-rose-200" : "text-emerald-200")}>{formatDelta(revenue.delta_pct)}</p>}
                </div>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Confidence</p>
              <div className="mt-3 flex items-end gap-4">
                <div className={cn("flex h-20 w-20 items-center justify-center rounded-full border text-3xl font-semibold ring-1", confidence.chip)}>
                  {Math.round(insight.confidence.overall * 100)}%
                </div>
                <div>
                  <p className="text-base font-semibold capitalize text-white">{insight.confidence.bucket} confidence</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Deterministic fusion of data quality, freshness, statistical strength, and evidence coverage.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI Summary */}
      <section className={cn(sectionClassName(), "p-5")}>
        <PanelHeader
          eyebrow="KPI SUMMARY"
          title="Overview"
          description="All KPI values come from the backend current-insight and KPI endpoints; no figures are hardcoded in the UI."
          icon={<Target className="h-5 w-5" />}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.kpi_id}
              kpi={kpi}
              active={activeKpi === kpi.kpi_id}
              sparkline={sparkCache[kpi.kpi_id]}
              signal={signalForKpi(insight.signals, kpi.kpi_id)}
              onClick={() => setActiveKpi(kpi.kpi_id)}
            />
          ))}
        </div>
      </section>

      {/* Revenue Trend */}
      <RevenueChartSection
        data={revenueSeries}
        currentStart={insight.period.current_start}
        currentEnd={insight.period.current_end}
        loading={chartLoading}
        error={chartError}
      />
    </div>
  );
}

function KpiCard({
  kpi,
  active,
  sparkline,
  onClick,
  signal,
}: {
  kpi: KPI;
  active: boolean;
  sparkline?: TimePoint[];
  onClick: () => void;
  signal: import("@/lib/api").Signal | null;
}) {
  const adverse = isAdverse(kpi);
  const changeTone = adverse ? "text-rose-300" : "text-emerald-300";
  const status = signal?.material ? (signal.severity === "high" ? "Alert" : "Watch") : adverse ? "Watch" : "Healthy";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-full flex-col rounded-[1.5rem] border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(2,8,23,0.45)]",
        active
          ? "border-cyan-400/30 bg-cyan-500/10 shadow-[0_16px_40px_rgba(8,145,178,0.18)]"
          : "border-white/10 bg-slate-950/70 hover:border-white/20"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{kpi.name}</p>
          {kpi.grain ? <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">{kpi.grain} grain</p> : null}
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{formatValue(kpi.current, kpi.unit)}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", statusTone(adverse, signal?.severity))}>{status}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-slate-400">Previous</span>
        <span className="font-medium text-slate-200">{formatValue(kpi.prior, kpi.unit)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="text-slate-400">Change</span>
        <span className={cn("font-semibold", changeTone)}>{formatDelta(kpi.delta_pct)}</span>
      </div>
      <div className="mt-3">
        <Sparkline data={sparkline} />
      </div>
    </button>
  );
}

function Sparkline({ data }: { data: TimePoint[] | undefined }) {
  if (!data?.length) {
    return <div className="h-12 rounded-xl border border-white/10 bg-white/5 animate-pulse" />;
  }

  const normalized = data.map((point, index) => ({ index, value: point.value }));
  const min = Math.min(...normalized.map((point) => point.value));
  const max = Math.max(...normalized.map((point) => point.value));
  const range = max - min || 1;

  return (
    <div className="h-12 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,31,0.95),rgba(10,14,25,0.95))] p-1.5">
      <svg viewBox="0 0 120 32" className="h-full w-full">
        <defs>
          <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(34 211 238)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="rgb(34 211 238)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="rgb(34 211 238)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={normalized
            .map((point) => {
              const x = normalized.length <= 1 ? 0 : (point.index / (normalized.length - 1)) * 120;
              const y = 30 - ((point.value - min) / range) * 24 - 2;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ")}
        />
        <polygon
          fill="url(#sparkFill)"
          points={`0,32 ${normalized
            .map((point) => {
              const x = normalized.length <= 1 ? 0 : (point.index / (normalized.length - 1)) * 120;
              const y = 30 - ((point.value - min) / range) * 24 - 2;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ")} 120,32`}
        />
      </svg>
    </div>
  );
}

function RevenueChartSection({
  data,
  currentStart,
  currentEnd,
  loading,
  error,
}: {
  data: TimePoint[] | undefined;
  currentStart?: string;
  currentEnd?: string;
  loading: boolean;
  error?: string | null;
}) {
  if (loading) {
    return (
      <section className={cn(sectionClassName(), "p-5")}>
        <SkeletonBlock className="h-8 w-64 mb-3" />
        <SkeletonBlock className="h-72 w-full" />
      </section>
    );
  }

  if (error) {
    return (
      <section className={cn(sectionClassName(), "p-5")}>
        <div className="flex h-72 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-6 text-center text-sm text-rose-100">
          Revenue chart could not load. {error}
        </div>
      </section>
    );
  }

  if (!data?.length) {
    return (
      <section className={cn(sectionClassName(), "p-5")}>
        <div className="flex h-72 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 px-6 text-center text-sm text-amber-100">
          No revenue timeseries was returned by the API.
        </div>
      </section>
    );
  }

  const chartData = data.map((point) => ({
    label: point.date.slice(5),
    value: point.value,
  }));
  const first = data[0]?.date;
  const last = data[data.length - 1]?.date;
  const displayRange = first && last ? `${formatDate(first)} → ${formatDate(last)}` : "Returned period";

  return (
    <section className={cn(sectionClassName(), "p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Revenue Trend — Last 90 Days</h3>
          <p className="text-xs text-slate-400">Actual returned period: {displayRange}</p>
        </div>
        {currentStart && currentEnd && (
          <div className="flex flex-wrap gap-2">
            <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">
              Current period {formatDate(currentStart)} → {formatDate(currentEnd)}
            </Chip>
          </div>
        )}
      </div>
      <div className="rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.16),transparent_42%),linear-gradient(180deg,rgba(8,12,24,0.98),rgba(6,10,18,0.98))] p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 6 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "rgba(148,163,184,0.2)" }} tickLine={false} interval={11} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "rgba(148,163,184,0.2)" }} tickLine={false} width={56} />
            <Tooltip
              contentStyle={{
                background: "rgba(2, 6, 23, 0.96)",
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: "16px",
                color: "#e2e8f0",
              }}
              labelStyle={{ color: "#cbd5e1", fontWeight: 600 }}
              formatter={(value) => [formatMoney(typeof value === "number" ? value : 0), "Revenue"]}
            />
            {currentStart && currentEnd && <ReferenceArea x1={currentStart.slice(5)} x2={currentEnd.slice(5)} fill="rgba(34,211,238,0.08)" strokeOpacity={0} />}
            {currentStart && <ReferenceLine x={currentStart.slice(5)} stroke="rgba(34,211,238,0.6)" strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={3} dot={false} activeDot={{ r: 4, stroke: "#22d3ee", strokeWidth: 2, fill: "#0f172a" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

