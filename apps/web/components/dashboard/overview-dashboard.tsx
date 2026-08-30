"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronRight,
  CircleAlert,
  Database,
  FileText,
  Gauge,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  LineChart as LineChartIcon,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  Workflow,
  Workflow as WorkflowIcon,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  api,
  type Confidence,
  type Evidence,
  type FeedbackRecord,
  type Insight,
  type KPI,
  type Persona,
  type Scenario,
  type Signal,
  type TimePoint,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type DashboardInsight = Insight & { persona: Persona };
type HealthState = "loading" | "ok" | "error";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const SCENARIOS: { value: Scenario; label: string; short: string }[] = [
  { value: "revenue_decline", label: "Revenue Decline", short: "Revenue Decline" },
  { value: "sparse_history", label: "Sparse History", short: "Sparse History" },
  { value: "contradictory", label: "Contradictory Evidence", short: "Contradictory Evidence" },
];

const PERSONAS: { value: Persona; label: string; short: string; icon: string }[] = [
  { value: "cfo", label: "CFO", short: "CFO", icon: "💼" },
  { value: "supply_chain_manager", label: "Supply Chain Manager", short: "Supply Chain Manager", icon: "🏭" },
];

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "insights", label: "Insights", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "simulation", label: "Simulation", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: "actions", label: "Actions", icon: <Sparkles className="h-4 w-4" /> },
  { id: "feedback", label: "Feedback", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "data-quality", label: "Data Quality", icon: <HeartPulse className="h-4 w-4" /> },
  { id: "lineage", label: "Lineage", icon: <GitBranch className="h-4 w-4" /> },
];

function formatDate(dateValue: string) {
  const value = new Date(`${dateValue}T00:00:00Z`);
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(dateValue: string) {
  return new Date(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}$${absolute.toFixed(2)}`;
}

function formatValue(value: number, unit: string) {
  if (unit === "usd") return formatMoney(value);
  if (unit === "pct") return `${(value * 100).toFixed(1)}%`;
  if (unit === "rate") return value.toFixed(2);
  if (unit === "units") return value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toFixed(0);
  return value.toFixed(2);
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function statusTone(adverse: boolean, severity?: string) {
  if (severity === "high") return adverse ? "bg-rose-500/15 text-rose-200 ring-rose-400/25" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
  if (severity === "medium") return adverse ? "bg-amber-500/15 text-amber-200 ring-amber-400/25" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
  return adverse ? "bg-sky-500/15 text-sky-100 ring-sky-400/25" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
}

function confidenceTone(score: number) {
  if (score >= 0.75) return { chip: "bg-emerald-500/15 text-emerald-100 ring-emerald-400/25", bar: "bg-emerald-400" };
  if (score >= 0.5) return { chip: "bg-amber-500/15 text-amber-100 ring-amber-400/25", bar: "bg-amber-400" };
  return { chip: "bg-rose-500/15 text-rose-100 ring-rose-400/25", bar: "bg-rose-400" };
}

function isAdverse(kpi: KPI) {
  return (kpi.direction === "higher_is_better" && kpi.delta_pct < 0) || (kpi.direction === "lower_is_better" && kpi.delta_pct > 0);
}

function signalForKpi(signals: Signal[], kpiId: string) {
  return signals.find((signal) => signal.kpi_id === kpiId) ?? null;
}

function methodLabel(driver: DashboardInsight["drivers"][number]) {
  return driver.correlation !== undefined || driver.method.includes("correlation") ? "Association strength" : "Contribution";
}

function driverMagnitude(driver: DashboardInsight["drivers"][number]) {
  if (driver.correlation !== undefined) return Math.abs(driver.correlation) * 100;
  return Math.abs(driver.contribution_pct);
}

function driverMetric(driver: DashboardInsight["drivers"][number]) {
  if (driver.correlation !== undefined) return `r=${driver.correlation.toFixed(3)}`;
  return `${driver.contribution_pct > 0 ? "+" : ""}${driver.contribution_pct.toFixed(1)}%`;
}

function driverSecondaryMetric(driver: DashboardInsight["drivers"][number]) {
  if (driver.effect_usd !== undefined) return formatMoney(driver.effect_usd);
  if (driver.kpi_delta_pct !== undefined) return `${driver.kpi_delta_pct > 0 ? "+" : ""}${driver.kpi_delta_pct.toFixed(1)}% KPI delta`;
  return null;
}

function evidenceValue(evidence: Evidence) {
  if (evidence.type === "top_mover") return formatMoney(evidence.value);
  if (evidence.type === "inventory_snapshot") return `${(evidence.value * 100).toFixed(1)}%`;
  if (evidence.type === "support_spike") return `${evidence.value > 0 ? "+" : ""}${evidence.value.toFixed(0)} tickets`;
  return String(evidence.value);
}

function sectionClassName() {
  return "rounded-[1.75rem] border border-white/10 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,8,23,0.4)] backdrop-blur-xl";
}

function PanelHeader({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-200">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100/70">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
      </div>
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200", className)}>
      {children}
    </span>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-2xl border border-white/10 bg-white/5", className)} />;
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

function CurrentPeriodChart({
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
      <div className="space-y-3">
        <SkeletonBlock className="h-8 w-64" />
        <SkeletonBlock className="h-72 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-6 text-center text-sm text-rose-100">
        Revenue chart could not load. {error}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 px-6 text-center text-sm text-amber-100">
        No revenue timeseries was returned by the API.
      </div>
    );
  }

  const chartData = data.map((point) => ({
    label: point.date.slice(5),
    value: point.value,
  }));
  const first = data[0]?.date;
  const last = data[data.length - 1]?.date;
  const displayRange = first && last ? `${formatDate(first)} → ${formatDate(last)}` : "Returned period";
  const title = data.length >= 90 ? "Revenue Trend — Last 90 Days" : `Revenue Trend — ${displayRange}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400">Actual returned period: {displayRange}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentStart && currentEnd && (
            <>
              <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">Current period {formatDate(currentStart)} → {formatDate(currentEnd)}</Chip>
              <Chip className="border-slate-400/20 bg-slate-500/10 text-slate-100">Prior period from insight metadata</Chip>
            </>
          )}
        </div>
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
  signal: Signal | null;
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

function DriverPanel({ insight }: { insight: DashboardInsight }) {
  const drivers = [...insight.drivers].sort((a, b) => driverMagnitude(b) - driverMagnitude(a));
  const maxValue = Math.max(...drivers.map((driver) => driverMagnitude(driver)), 1);

  return (
    <section id="insights" className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="WHY did this happen?"
        title="Driver analysis"
        description="Ranked real drivers from the backend, with contribution bars for decomposition and association bars where the backend returned correlation instead of causal contribution."
        icon={<BarChart3 className="h-5 w-5" />}
      />
      <div className="space-y-3">
        {drivers.map((driver, index) => {
          const width = (driverMagnitude(driver) / maxValue) * 100;
          const accent = driver.direction === "negative" ? "bg-rose-400" : "bg-emerald-400";
          return (
            <div key={driver.driver_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <Chip className="border-white/10 bg-white/5 text-slate-200">{String(index + 1).padStart(2, "0")}</Chip>
                <p className="min-w-0 flex-1 text-sm font-semibold text-white">{driver.label}</p>
                <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">{methodLabel(driver)}</Chip>
                <Chip className="border-white/10 bg-white/5 text-slate-200">{driver.method.replace(/_/g, " ")}</Chip>
                <Chip className={cn("ring-1", driver.direction === "negative" ? "border-rose-400/20 bg-rose-500/10 text-rose-100" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100") }>{Math.round(driver.confidence * 100)}% confidence</Chip>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-900/80">
                <div className={cn("h-full rounded-full", accent)} style={{ width: `${width}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1", driver.direction === "negative" ? "bg-rose-500/10 text-rose-100 ring-rose-400/20" : "bg-emerald-500/10 text-emerald-100 ring-emerald-400/20") }>
                  {driverMetric(driver)}
                </span>
                {driverSecondaryMetric(driver) && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
                    {driverSecondaryMetric(driver)}
                  </span>
                )}
                {driver.correlation !== undefined && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
                    Association strength not contribution
                  </span>
                )}
                {driver.p_value !== undefined && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
                    p={driver.p_value.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-cyan-400/20 hover:bg-cyan-500/[0.05]">
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">{evidence.source.replace(/_/g, " ")}</Chip>
        <Chip className="border-white/10 bg-white/5 text-slate-200">{evidence.method.replace(/_/g, " ")}</Chip>
        <Chip className="border-white/10 bg-white/5 text-slate-200">{evidence.type.replace(/_/g, " ")}</Chip>
      </div>
      <p className="mt-3 text-sm leading-6 text-white">{evidence.finding}</p>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
          <p className="text-slate-400">Value</p>
          <p className="mt-1 font-semibold text-white">{evidenceValue(evidence)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
          <p className="text-slate-400">Freshness / timestamp</p>
          <p className="mt-1 font-semibold text-white">{evidence.timestamp || "Not provided"}</p>
        </div>
      </div>
    </article>
  );
}

function ConfidencePanel({ confidence, insight }: { confidence: Confidence; insight: DashboardInsight }) {
  const tone = confidenceTone(confidence.overall);
  const topDriversCoverage = Math.min(
    1,
    insight.drivers.slice(0, 3).reduce((sum, driver) => sum + Math.abs(driver.contribution_pct || 0), 0) / 100
  );

  return (
    <section id="data-quality" className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="CONFIDENCE"
        title="Why should I trust this?"
        description="The confidence score is a deterministic fusion of data quality, freshness, statistical strength, and evidence coverage, not a narrative guess."
        icon={<Gauge className="h-5 w-5" />}
      />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 flex-1 items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
          <div className={cn("flex h-24 w-24 items-center justify-center rounded-full border text-3xl font-semibold ring-1", tone.chip)}>
            {Math.round(confidence.overall * 100)}%
          </div>
          <div>
            <p className="text-lg font-semibold text-white capitalize">{confidence.bucket} confidence</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">
              High-quality data, recent source freshness, and statistically strong drivers support this outcome.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip className="border-white/10 bg-white/5 text-slate-200">Top-3 driver coverage: {Math.round(topDriversCoverage * 100)}%</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">Evidence items: {insight.evidence.length}</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">Drivers: {insight.drivers.length}</Chip>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
          {([
            ["data_quality", "Data Quality"],
            ["freshness", "Freshness"],
            ["stat_strength", "Statistical Strength"],
            ["evidence_coverage", "Evidence Coverage"],
          ] as const).map(([key, label]) => {
            const value = confidence.components[key];
            return (
              <div key={key} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
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
  );
}

function MethodTransparency({ insight }: { insight: DashboardInsight }) {
  const stages = [
    { label: "DATA SOURCES", method: "Sales, inventory, support", icon: <Database className="h-4 w-4" /> },
    { label: "SQL KPI CALCULATION", method: "Deterministic KPI windows", icon: <FileText className="h-4 w-4" /> },
    { label: "STATISTICAL DETECTION", method: "Materiality + z-score", icon: <ShieldAlert className="h-4 w-4" /> },
    { label: "DRIVER ANALYSIS", method: "Decomposition + correlation", icon: <BarChart3 className="h-4 w-4" /> },
    { label: "EVIDENCE GROUNDING", method: "Source-backed findings", icon: <GitBranch className="h-4 w-4" /> },
    { label: "DETERMINISTIC CONFIDENCE", method: "Weighted fusion", icon: <Activity className="h-4 w-4" /> },
    { label: "ACTION RECOMMENDATION", method: "Rule-based lever mapping", icon: <Sparkles className="h-4 w-4" /> },
    { label: "LLM / TEMPLATE NARRATIVE", method: "Narrative only", icon: <WorkflowIcon className="h-4 w-4" /> },
  ];

  return (
    <section className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="METHOD TRANSPARENCY"
        title="How this insight was produced"
        description="The pipeline is intentionally explicit so quantitative truth stays in SQL and statistics, while the narrative layer remains presentation only."
        icon={<Workflow className="h-5 w-5" />}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => (
          <div key={stage.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">{stage.icon}</span>
              <span>{stage.label}</span>
            </div>
            <p className="mt-3 text-sm text-slate-300">{stage.method}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
        <strong>LLM is not the source of quantitative truth.</strong> It only formats the already computed facts into a narrative.
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Narrative layer</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{insight.narrative}</p>
      </div>
    </section>
  );
}

function AbstentionPanel({ insight }: { insight: DashboardInsight }) {
  if (!insight.abstention) return null;

  const sparse = insight.abstention.reason === "abstain_sparse_history";
  const contradictory = insight.abstention.reason === "abstain_contradictory";
  const title = sparse ? "INSIGHT WITHHELD" : contradictory ? "ABSTAINED" : "INSIGHT WITHHELD";
  const message = sparse ? "Insufficient historical evidence." : contradictory ? "Conflicting evidence." : insight.abstention.message;

  return (
    <section className="rounded-[1.75rem] border border-amber-400/25 bg-amber-500/10 p-5 text-amber-50 shadow-[0_24px_80px_rgba(120,53,15,0.2)]">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-100">
          <CircleAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-100/80">{title}</p>
            <p className="mt-2 text-sm leading-6 text-amber-50">{message}</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/80">{insight.abstention.message}</p>
          </div>
          {insight.abstention.data_days !== undefined && (
            <div className="flex flex-wrap gap-2">
              <Chip className="border-amber-200/20 bg-amber-500/15 text-amber-50">History available: {insight.abstention.data_days} days</Chip>
              <Chip className="border-amber-200/20 bg-amber-500/15 text-amber-50">Minimum required: 30 days</Chip>
            </div>
          )}
          {insight.abstention.competing_hypotheses?.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {insight.abstention.competing_hypotheses.map((hypothesis) => (
                <div key={hypothesis.hypothesis} className="rounded-2xl border border-amber-200/15 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-amber-50">{hypothesis.hypothesis}</p>
                    <Chip className="border-amber-200/20 bg-amber-500/15 text-amber-50">{hypothesis.support_pct}% support</Chip>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-amber-100/90">Why it competes: {hypothesis.contradiction}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="rounded-2xl border border-amber-200/15 bg-black/20 p-4 text-sm text-amber-50">
            Manual investigation required before action.
          </div>
        </div>
      </div>
    </section>
  );
}

function RecommendedActions({ insight }: { insight: DashboardInsight }) {
  const personaLabel = insight.persona === "cfo" ? "CFO" : "Supply Chain Manager";
  const focus = insight.persona === "cfo"
    ? ["Financial impact", "Revenue protection", "Budget/cost implications"]
    : ["Inventory", "Distribution centers", "Operational recovery"];

  return (
    <section id="actions" className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="ACTION"
        title="Recommended action"
        description="The backend returns the lever and action for the selected persona. This view preserves that recommendation and makes the decision flow explicit."
        icon={<Sparkles className="h-5 w-5" />}
      />
      {insight.abstention ? (
        <AbstentionPanel insight={insight} />
      ) : insight.actions.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            {insight.actions.map((action, index) => (
              <article key={action.action_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">{String(index + 1).padStart(2, "0")}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.driver_label}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.lever}</Chip>
                  <Chip className="border-white/10 bg-white/5 text-slate-200">{action.owner}</Chip>
                  <Chip className={cn("ring-1", action.confidence >= 0.75 ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-amber-400/20 bg-amber-500/10 text-amber-100") }>{Math.round(action.confidence * 100)}% confidence</Chip>
                </div>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Driver → Lever → Action → Owner</p>
                    <p className="mt-2 text-sm leading-6 text-white">{action.action}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
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
                  <div className="rounded-xl border border-amber-400/15 bg-amber-500/10 p-3 text-sm text-amber-50">
                    Constraints: not exposed by the current backend payload.
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Persona focus</p>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm font-semibold text-white">{personaLabel}</p>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                {focus.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-cyan-200" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Why it matters</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                These recommendations are returned directly by the backend and keep the action owner, expected impact, and confidence visible for judging.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">No recommendation returned for this persona.</div>
      )}
    </section>
  );
}

function PersonaComparison({ cfoInsight, scmInsight }: { cfoInsight: DashboardInsight | null; scmInsight: DashboardInsight | null }) {
  const cards = [
    {
      label: "CFO",
      icon: "💼",
      insight: cfoInsight,
      focus: ["Financial impact", "Revenue protection", "Budget/cost implications"],
      accent: "from-cyan-500/15 to-slate-900/60",
    },
    {
      label: "Supply Chain Manager",
      icon: "🏭",
      insight: scmInsight,
      focus: ["Inventory", "Distribution centers", "Operational recovery"],
      accent: "from-emerald-500/15 to-slate-900/60",
    },
  ];

  return (
    <section className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="PERSONA COMPARISON"
        title="CFO and Supply Chain Manager views"
        description="The same evidence produces meaningfully different action sets and emphasis depending on the persona selected by the backend."
        icon={<Building2 className="h-5 w-5" />}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <div key={card.label} className={cn("rounded-[1.5rem] border border-white/10 bg-gradient-to-br p-4", card.accent)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl">{card.icon}</p>
                <p className="mt-2 text-lg font-semibold text-white">{card.label}</p>
                <p className="mt-1 text-sm text-slate-300">{card.insight ? `${card.insight.actions.length} backend action(s)` : "No insight loaded"}</p>
              </div>
              <Chip className="border-white/10 bg-white/5 text-slate-100">Persona lens</Chip>
            </div>
            <div className="mt-4 space-y-2">
              {card.focus.map((focusItem) => (
                <div key={focusItem} className="flex items-center gap-2 text-sm text-slate-200">
                  <ShieldCheck className="h-4 w-4 text-cyan-200" />
                  <span>{focusItem}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {(card.insight?.actions ?? []).slice(0, 2).map((action) => (
                <div key={action.action_id} className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-200">
                  <p className="font-semibold text-white">{action.lever}</p>
                  <p className="mt-1 leading-6">{action.action}</p>
                </div>
              ))}
              {!card.insight?.actions.length && card.insight?.abstention && (
                <div className="rounded-xl border border-amber-400/15 bg-amber-500/10 p-3 text-sm text-amber-50">Recommendation withheld due to abstention.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeedbackPanel({ items }: { items: FeedbackRecord[] }) {
  return (
    <section id="feedback" className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="FEEDBACK"
        title="Recent feedback"
        description="The backend feedback log is surfaced here so the judging demo can show the learning loop without inventing any records."
        icon={<MessageSquare className="h-5 w-5" />}
      />
      {items.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.slice(0, 6).map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">{item.persona.replace(/_/g, " ")}</Chip>
                <Chip className="border-white/10 bg-white/5 text-slate-200">{item.rating}</Chip>
                <Chip className="border-white/10 bg-white/5 text-slate-200">{formatDateTime(item.created_at)}</Chip>
              </div>
              <p className="mt-3 text-sm text-white">{item.comment || "No comment provided"}</p>
              <p className="mt-2 text-xs text-slate-400">Action taken: {item.action_taken || "Not provided"}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">No feedback has been recorded yet.</div>
      )}
    </section>
  );
}

function DataQualityPanel({ insight }: { insight: DashboardInsight }) {
  return (
    <section id="data-quality" className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="DATA QUALITY"
        title="Source health and evidence strength"
        description="This panel reflects the backend confidence components and the actual evidence footprint behind the recommendation."
        icon={<HeartPulse className="h-5 w-5" />}
      />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-end gap-4">
            <div className={cn("flex h-24 w-24 items-center justify-center rounded-full border text-3xl font-semibold ring-1", confidenceTone(insight.confidence.overall).chip)}>
              {Math.round(insight.confidence.overall * 100)}%
            </div>
            <div>
              <p className="text-lg font-semibold text-white">Trust signal</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">Based on deterministic confidence fusion from the backend.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3">Data quality and freshness are surfaced directly from the confidence components.</p>
            <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3">Evidence coverage reflects the share of the delta explained by top drivers.</p>
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
                  <div className={cn("h-2 rounded-full", confidenceTone(insight.confidence.overall).bar)} style={{ width: `${(value * 100).toFixed(0)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LineagePanel({ insight }: { insight: DashboardInsight }) {
  const sources = Array.from(new Set(insight.evidence.map((item) => item.source)));

  return (
    <section id="lineage" className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="LINEAGE"
        title="Source traceability"
        description="Evidence items point back to the actual source systems the backend used, keeping the investigation auditable."
        icon={<GitBranch className="h-5 w-5" />}
      />
      <div className="grid gap-3 xl:grid-cols-3">
        {sources.map((source) => (
          <div key={source} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">{source.replace(/_/g, " ")}</p>
            <p className="mt-2 text-sm text-slate-300">Backed by evidence cards and current insight outputs from the backend.</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
        Generated at {formatDateTime(insight.generated_at)} for insight {insight.insight_id}.
      </div>
    </section>
  );
}

function Sidebar({
  scenario,
  persona,
  health,
}: {
  scenario: Scenario;
  persona: Persona;
  health: HealthState;
}) {
  const personaLabel = PERSONAS.find((item) => item.value === persona)?.label ?? persona;

  return (
    <aside className="hidden xl:sticky xl:top-0 xl:flex xl:h-screen xl:w-72 xl:flex-col xl:border-r xl:border-white/10 xl:bg-slate-950/90 xl:px-5 xl:py-5">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">NEXUS.ai</p>
          <p className="text-xs text-slate-400">KPI Intelligence → Action</p>
        </div>
      </div>

      <nav className="mt-5 space-y-1">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <span className="text-cyan-200/90">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">System status</p>
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className={cn("h-2.5 w-2.5 rounded-full", health === "ok" ? "bg-emerald-400" : health === "error" ? "bg-rose-400" : "bg-amber-400")} />
          <span>{health === "ok" ? "System Healthy" : health === "error" ? "System Error" : "Checking health"}</span>
        </div>
      </div>

      <div className="mt-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Current scenario</p>
        <p className="mt-2 text-sm font-semibold text-white">{SCENARIOS.find((item) => item.value === scenario)?.label}</p>
        <p className="mt-1 text-xs text-slate-400">Switch scenarios from the top header.</p>
      </div>

      <div className="mt-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Current persona</p>
        <p className="mt-2 text-sm font-semibold text-white">{personaLabel}</p>
        <p className="mt-1 text-xs text-slate-400">Role-specific recommendations stay visible.</p>
      </div>

      <div className="mt-auto rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_40%),linear-gradient(180deg,rgba(8,12,24,0.95),rgba(2,6,23,0.95))] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/80">KPI Intelligence → Action</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">Premium decision workspace for judges and operators. Real backend numbers only.</p>
      </div>
    </aside>
  );
}

function TopHeader({
  scenario,
  persona,
  health,
  onScenarioChange,
  onPersonaChange,
}: {
  scenario: Scenario;
  persona: Persona;
  health: HealthState;
  onScenarioChange: (scenario: Scenario) => void;
  onPersonaChange: (persona: Persona) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl xl:hidden">
      <div className="px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-white">NEXUS.ai</p>
            <p className="text-xs text-slate-400">KPI Intelligence → Action</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <span className={cn("h-2.5 w-2.5 rounded-full", health === "ok" ? "bg-emerald-400" : health === "error" ? "bg-rose-400" : "bg-amber-400")} />
            <span>{health === "ok" ? "System Healthy" : health === "error" ? "System Error" : "Checking"}</span>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SCENARIOS.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={scenario === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => onScenarioChange(item.value)}
              className={cn(
                "shrink-0 rounded-full px-3 text-xs",
                scenario === item.value ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              )}
            >
              {item.short}
            </Button>
          ))}
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {PERSONAS.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={persona === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => onPersonaChange(item.value)}
              className={cn(
                "shrink-0 rounded-full px-3 text-xs",
                persona === item.value ? "bg-white text-slate-950 hover:bg-cyan-50" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              )}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}

function InsightHero({ insight }: { insight: DashboardInsight }) {
  const revenue = insight.kpis.find((item) => item.kpi_id === "revenue");
  const revenueSignal = signalForKpi(insight.signals, "revenue");
  const adverse = revenue ? isAdverse(revenue) : false;
  const confidence = confidenceTone(insight.confidence.overall);

  return (
    <section id="overview" className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.18),transparent_40%),linear-gradient(135deg,rgba(2,6,23,0.95),rgba(11,16,31,0.95))] p-5 shadow-[0_28px_100px_rgba(2,8,23,0.5)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip className="border-white/10 bg-white/5 text-slate-200">{insight.scenario_label}</Chip>
            <Chip className="border-white/10 bg-white/5 text-slate-200">{PERSONAS.find((item) => item.value === insight.persona)?.label ?? insight.persona}</Chip>
            <Chip className="border-white/10 bg-white/5 text-slate-200">Insight {insight.insight_id}</Chip>
            <Chip className="border-white/10 bg-white/5 text-slate-200">{formatDateTime(insight.generated_at)}</Chip>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-100/80">Revenue Decline Insight</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Revenue {revenue ? (revenue.delta_pct < 0 ? "↓" : "↑") : "—"} {revenue ? Math.abs(revenue.delta_pct).toFixed(1) : "—"}%</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Material KPI movement detected. The dashboard is driven by the backend real insight payload, KPI calculations, driver analysis, and evidence trail.</p>
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
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-slate-400">Current period</p>
                <p className="mt-1 font-medium text-white">{revenue?.period ?? insight.period.current_start}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-slate-400">Previous period</p>
                <p className="mt-1 font-medium text-white">{revenue?.prior_period ?? insight.period.prior_start}</p>
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip className="border-white/10 bg-white/5 text-slate-200">Driver set: {insight.drivers.length}</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">Evidence set: {insight.evidence.length}</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">Actions: {insight.actions.length}</Chip>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OverviewDashboard() {
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("revenue_decline");
  const [persona, setPersona] = useState<Persona>("cfo");
  const [insight, setInsight] = useState<DashboardInsight | null>(null);
  const [peerInsight, setPeerInsight] = useState<DashboardInsight | null>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [health, setHealth] = useState<HealthState>("loading");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<string>("revenue");
  const [sparkCache, setSparkCache] = useState<Record<string, TimePoint[]>>({});
  const [sparkErrors, setSparkErrors] = useState<Record<string, string | null>>({});
  const sparkInFlight = useRef<Set<string>>(new Set());

  const selectedPersonaLabel = PERSONAS.find((item) => item.value === persona)?.label ?? persona;
  const selectedInsight = insight;

  const selectedKpi = useMemo(() => kpis.find((item) => item.kpi_id === activeKpi) ?? kpis[0] ?? null, [activeKpi, kpis]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadShell() {
      try {
        const [healthResult, feedbackResult] = await Promise.allSettled([
          api.health({ signal: controller.signal }),
          api.feedbackList({ signal: controller.signal }),
        ]);
        if (cancelled) return;
        setHealth(healthResult.status === "fulfilled" ? "ok" : "error");
        if (feedbackResult.status === "fulfilled") {
          setFeedback(feedbackResult.value);
        }
      } catch {
        if (!cancelled) setHealth("error");
      }
    }

    loadShell();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const peerPersona: Persona = persona === "cfo" ? "supply_chain_manager" : "cfo";

    async function loadScenario() {
      setLoading(true);
      setError(null);
      setInsight(null);
      setPeerInsight(null);
      setKpis([]);
      // Clear stale sparkline cache when scenario changes
      setSparkCache({});
      setSparkErrors({});

      try {
        const insightResult = await api.insight(scenario, persona, { signal: controller.signal });
        if (cancelled) return;
        setInsight({ ...insightResult, persona });
      } catch (reason) {
        // Don't show "Failed to fetch" errors from aborted requests
        if (!cancelled && reason instanceof Error && !reason.message.includes('aborted')) {
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
        // Don't show "Failed to fetch" errors from aborted requests
        if (!cancelled && reason instanceof Error && !reason.message.includes('aborted')) {
          setError(String(reason));
        }
      }

      try {
        const peerResult = await api.insight(scenario, peerPersona, { signal: controller.signal });
        if (cancelled) return;
        setPeerInsight({ ...peerResult, persona: peerPersona });
      } catch {
        if (!cancelled) setPeerInsight(null);
      }

      setLoading(false);
    }

    loadScenario();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scenario, persona]);

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
            // Don't log aborted/cancelled requests as errors
            if (!errorMsg.includes('aborted') && !errorMsg.includes('cancel')) {
              console.error(`Timeseries error for ${kpi.kpi_id}:`, reason);
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
  }, [kpis, scenario]); // Added scenario to dependencies so cache refreshes on scenario change

  useEffect(() => {
    if (!selectedKpi && kpis[0]) {
      setActiveKpi(kpis[0].kpi_id);
    }
  }, [kpis, selectedKpi]);

  const revenueSeries = sparkCache.revenue;
  const currentInsight = selectedInsight ?? peerInsight;

  const onScenarioChange = (next: Scenario) => {
    setScenario(next);
    router.replace(`/?scenario=${next}&persona=${persona}`);
  };

  const onPersonaChange = (next: Persona) => {
    setPersona(next);
    router.replace(`/?scenario=${scenario}&persona=${next}`);
  };

  const chartLoading = loading && !revenueSeries;
  const chartError = sparkErrors.revenue;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.14),_transparent_30%),linear-gradient(180deg,#050b16_0%,#07111f_48%,#040815_100%)] text-slate-100">
        <TopHeader scenario={scenario} persona={persona} health={health} onScenarioChange={onScenarioChange} onPersonaChange={onPersonaChange} />
      <div className="flex">
        <Sidebar scenario={scenario} persona={persona} health={health} />

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1540px] px-4 py-4 sm:px-6 lg:px-8 xl:py-6">
            <div className="mb-5 flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_20px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/75">System Healthy</p>
                <p className="mt-1 truncate text-sm text-slate-300">Scenario: {SCENARIOS.find((item) => item.value === scenario)?.label} · Persona: {selectedPersonaLabel}</p>
              </div>
              <div className="hidden flex-wrap items-center gap-2 lg:flex">
                {SCENARIOS.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={scenario === item.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => onScenarioChange(item.value)}
                    className={cn(
                      "rounded-full px-4 text-xs",
                      scenario === item.value ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    )}
                  >
                    {item.label}
                  </Button>
                ))}
                {PERSONAS.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={persona === item.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => onPersonaChange(item.value)}
                    className={cn(
                      "rounded-full px-4 text-xs",
                      persona === item.value ? "bg-white text-slate-950 hover:bg-cyan-50" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    )}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.short}
                  </Button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-5 rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                Backend error: {error}. The UI is still running, but some sections may be unavailable until the API is back.
              </div>
            )}

            {loading && !currentInsight ? (
              <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
                <div className="space-y-6">
                  <SkeletonBlock className="h-[360px] w-full" />
                  <SkeletonBlock className="h-[280px] w-full" />
                  <SkeletonBlock className="h-[360px] w-full" />
                </div>
                <div className="space-y-6">
                  <SkeletonBlock className="h-[360px] w-full" />
                  <SkeletonBlock className="h-[240px] w-full" />
                  <SkeletonBlock className="h-[360px] w-full" />
                </div>
              </div>
            ) : currentInsight ? (
              <div className="space-y-6">
                <InsightHero insight={currentInsight} />

                {currentInsight.abstention && <AbstentionPanel insight={currentInsight} />}

                <section id="overview" className={cn(sectionClassName(), "p-5") }>
                  <PanelHeader
                    eyebrow="KPI SUMMARY"
                    title="Overview"
                    description="All KPI values come from the backend current-insight and KPI endpoints; no figures are hardcoded in the UI."
                    icon={<Target className="h-5 w-5" />}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {kpis.map((kpi) => (
                      <KpiCard
                        key={kpi.kpi_id}
                        kpi={kpi}
                        active={activeKpi === kpi.kpi_id}
                        sparkline={sparkCache[kpi.kpi_id]}
                        signal={signalForKpi(currentInsight.signals, kpi.kpi_id)}
                        onClick={() => setActiveKpi(kpi.kpi_id)}
                      />
                    ))}
                  </div>
                </section>

                <section id="insights" className={cn(sectionClassName(), "p-5") }>
                  <PanelHeader
                    eyebrow="REVENUE TREND"
                    title="Revenue Trend — Last 90 Days"
                    description="The chart uses the real backend timeseries endpoint. It shows the returned period, highlights the current insight window, and degrades gracefully on errors or empty responses."
                    icon={<LineChartIcon className="h-5 w-5" />}
                  />
                  <CurrentPeriodChart
                    data={revenueSeries}
                    currentStart={currentInsight.period.current_start}
                    currentEnd={currentInsight.period.current_end}
                    loading={chartLoading}
                    error={chartError}
                  />
                </section>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <DriverPanel insight={currentInsight} />
                  <section id="simulation" className={cn(sectionClassName(), "p-5") }>
                    <PanelHeader
                      eyebrow="SIMULATION"
                      title="Decision levers"
                      description="The MVP does not expose a separate simulation API, so this section surfaces the real action set as the available lever space."
                      icon={<SlidersHorizontal className="h-5 w-5" />}
                    />
                    {currentInsight.abstention ? (
                      <AbstentionPanel insight={currentInsight} />
                    ) : currentInsight.actions.length ? (
                      <div className="space-y-3">
                        {currentInsight.actions.map((action) => (
                          <div key={action.action_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Chip className="border-white/10 bg-white/5 text-slate-200">{action.driver_label}</Chip>
                              <Chip className="border-white/10 bg-white/5 text-slate-200">{action.lever}</Chip>
                              <Chip className="border-white/10 bg-white/5 text-slate-200">{action.owner}</Chip>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-white">{action.action}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                              <Chip className="border-white/10 bg-white/5 text-slate-200">Expected impact: {action.expected_impact}</Chip>
                              <Chip className="border-white/10 bg-white/5 text-slate-200">Confidence: {Math.round(action.confidence * 100)}%</Chip>
                              <Chip className="border-white/10 bg-white/5 text-slate-200">Priority: {action.priority}</Chip>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">No action candidates were returned for this scenario.</div>
                    )}
                  </section>
                </div>

                <RecommendedActions insight={currentInsight} />
                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <ConfidencePanel confidence={currentInsight.confidence} insight={currentInsight} />
                  <PersonaComparison cfoInsight={persona === "cfo" ? currentInsight : peerInsight} scmInsight={persona === "supply_chain_manager" ? currentInsight : peerInsight} />
                </div>

                <EvidenceSection insight={currentInsight} />
                <MethodTransparency insight={currentInsight} />
                <DataQualityPanel insight={currentInsight} />
                <LineagePanel insight={currentInsight} />
                <FeedbackPanel items={feedback} />
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
                No insight could be loaded.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function EvidenceSection({ insight }: { insight: DashboardInsight }) {
  return (
    <section className={cn(sectionClassName(), "p-5") }>
      <PanelHeader
        eyebrow="EVIDENCE"
        title="Key evidence"
        description="Every evidence item returned by the API is shown as a source-backed card with finding, value, method, and freshness/timestamp."
        icon={<Database className="h-5 w-5" />}
      />
      <div className="grid gap-3 xl:grid-cols-2">
        {insight.evidence.map((evidence) => (
          <EvidenceCard key={evidence.ev_id} evidence={evidence} />
        ))}
      </div>
    </section>
  );
}
