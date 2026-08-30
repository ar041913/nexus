"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  CircleSlash2,
  Database,
  Gauge,
  Layers3,
  ShieldAlert,
  Target,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Insight, type Persona, type Scenario } from "@/lib/api";
import { cn } from "@/lib/utils";

type InsightWithPersona = Insight & { persona: Persona };

const SCENARIOS: { value: Scenario; label: string; subtitle: string }[] = [
  { value: "revenue_decline", label: "Revenue Decline", subtitle: "Primary investigative lens" },
  { value: "sparse_history", label: "Sparse History", subtitle: "Insufficient history guardrail" },
  { value: "contradictory", label: "Contradictory", subtitle: "Conflicting evidence guardrail" },
];

const PERSONAS: { value: Persona; label: string; icon: string }[] = [
  { value: "cfo", label: "CFO", icon: "💼" },
  { value: "supply_chain_manager", label: "Supply Chain Manager", icon: "🏭" },
];

function fmtMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtValue(value: number, unit: string) {
  if (unit === "usd") return fmtMoney(value);
  if (unit === "pct") return `${(value * 100).toFixed(1)}%`;
  if (unit === "rate") return value.toFixed(2);
  if (unit === "units") return value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toFixed(0);
  return value.toFixed(2);
}

function fmtDelta(deltaPct: number, direction: string) {
  const sign = deltaPct > 0 ? "+" : "";
  const adverse = (direction === "higher_is_better" && deltaPct < 0) || (direction === "lower_is_better" && deltaPct > 0);
  return {
    label: `${sign}${deltaPct.toFixed(1)}%`,
    tone: adverse ? "text-rose-500" : "text-emerald-500",
  };
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return "Freshness not provided";
  return timestamp;
}

function confidenceTone(score: number) {
  if (score >= 0.75) return { bg: "bg-emerald-500/15", fg: "text-emerald-300", ring: "ring-emerald-400/30" };
  if (score >= 0.5) return { bg: "bg-amber-500/15", fg: "text-amber-300", ring: "ring-amber-400/30" };
  return { bg: "bg-rose-500/15", fg: "text-rose-300", ring: "ring-rose-400/30" };
}

function severityTone(severity?: string, material?: boolean) {
  if (severity === "high") return "bg-rose-500/15 text-rose-300 ring-rose-400/20";
  if (severity === "medium") return "bg-amber-500/15 text-amber-300 ring-amber-400/20";
  if (material) return "bg-sky-500/15 text-sky-300 ring-sky-400/20";
  return "bg-white/5 text-slate-300 ring-white/10";
}

function methodLabel(driver: Insight["drivers"][number]) {
  return driver.correlation !== undefined || driver.method.includes("correlation") ? "Association" : "Contribution";
}

function driverScore(driver: Insight["drivers"][number]) {
  if (driver.correlation !== undefined) return Math.abs(driver.correlation);
  return Math.abs(driver.contribution_pct);
}

function driverMetricValue(driver: Insight["drivers"][number]) {
  if (driver.correlation !== undefined) return `r ${driver.correlation >= 0 ? "+" : ""}${driver.correlation.toFixed(3)}`;
  return `${driver.contribution_pct >= 0 ? "+" : ""}${driver.contribution_pct.toFixed(1)}%`;
}

function driverDetailValue(driver: Insight["drivers"][number]) {
  if (driver.effect_usd !== undefined) return fmtMoney(driver.effect_usd);
  if (driver.kpi_delta_pct !== undefined) return `${driver.kpi_delta_pct >= 0 ? "+" : ""}${driver.kpi_delta_pct.toFixed(1)}% KPI delta`;
  return "";
}

function evidenceValue(ev: Insight["evidence"][number]) {
  if (ev.type === "top_mover") return fmtMoney(ev.value);
  if (ev.type === "inventory_snapshot") return `${(ev.value * 100).toFixed(1)}%`;
  if (ev.type === "support_spike") return `${ev.value >= 0 ? "+" : ""}${ev.value.toFixed(0)} tickets`;
  return `${ev.value}`;
}

function SectionCard({
  eyebrow,
  title,
  description,
  icon,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200", className)}>{children}</span>;
}

function InsightBanner({ insight }: { insight: InsightWithPersona }) {
  const revenue = insight.kpis.find((k) => k.kpi_id === "revenue");
  const signal = insight.signals.find((s) => s.kpi_id === "revenue") ?? insight.signals[0];
  const signalTone = severityTone(signal?.severity, signal?.material);
  const delta = revenue ? fmtDelta(revenue.delta_pct, revenue.direction) : null;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_40%),linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.92))] p-6 shadow-[0_24px_80px_rgba(8,15,35,0.45)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{insight.scenario_label}</Pill>
            <Pill>{insight.persona === "cfo" ? "CFO lens" : "Supply Chain Manager lens"}</Pill>
            <Pill>Insight ID {insight.insight_id}</Pill>
            <Pill>{insight.generated_at}</Pill>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200/75">Current investigation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">What happened, why, and what to do next.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              A factual, backend-driven investigation view for the current insight. Quantitative truth comes directly from the API payload and the underlying analytics engine.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px] lg:grid-cols-1">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Revenue</p>
                <p className="mt-2 text-3xl font-semibold text-white">{revenue ? fmtValue(revenue.current, revenue.unit) : "—"}</p>
                <p className="mt-1 text-sm text-slate-300">Previous {revenue ? fmtValue(revenue.prior, revenue.unit) : "—"}</p>
              </div>
              <div className={cn("rounded-2xl px-3 py-2 text-right ring-1", signalTone)}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{signal?.material ? "Material" : "Not material"}</p>
                <p className="mt-1 text-sm font-semibold">Severity {signal?.severity ?? "n/a"}</p>
                {delta && <p className={cn("mt-1 text-sm font-semibold", delta.tone)}>{delta.label}</p>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="rounded-xl bg-slate-900/70 p-3">
                <p className="text-slate-400">Current period</p>
                <p className="mt-1 font-medium text-white">{revenue?.period ?? insight.period.current_start}</p>
              </div>
              <div className="rounded-xl bg-slate-900/70 p-3">
                <p className="text-slate-400">Prior period</p>
                <p className="mt-1 font-medium text-white">{revenue?.prior_period ?? insight.period.prior_start}</p>
              </div>
            </div>
          </div>
          <div className={cn("rounded-2xl border border-white/10 bg-white/5 p-4", confidenceTone(insight.confidence.overall).bg)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Confidence</p>
            <div className="mt-2 flex items-end gap-3">
              <div className={cn("flex h-20 w-20 items-center justify-center rounded-full border text-2xl font-semibold ring-1", confidenceTone(insight.confidence.overall).bg, confidenceTone(insight.confidence.overall).fg, confidenceTone(insight.confidence.overall).ring)}>
                {Math.round(insight.confidence.overall * 100)}%
              </div>
              <div>
                <p className={cn("text-sm font-semibold capitalize", confidenceTone(insight.confidence.overall).fg)}>{insight.confidence.bucket} confidence</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">Deterministic fusion of data quality, freshness, statistical strength, and evidence coverage.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueSummary({ insight }: { insight: InsightWithPersona }) {
  const revenue = insight.kpis.find((k) => k.kpi_id === "revenue");
  const signal = insight.signals.find((s) => s.kpi_id === "revenue");
  const delta = revenue ? fmtDelta(revenue.delta_pct, revenue.direction) : null;

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill className="bg-cyan-500/15 text-cyan-100">WHAT happened?</Pill>
        <Pill>Revenue KPI</Pill>
        <Pill>{signal?.material ? "Material signal" : "Non-material signal"}</Pill>
        <Pill>Severity {signal?.severity ?? "n/a"}</Pill>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm font-semibold text-slate-200">Revenue</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Current value</p>
              <p className="mt-2 text-2xl font-semibold text-white">{revenue ? fmtValue(revenue.current, revenue.unit) : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Previous value</p>
              <p className="mt-2 text-2xl font-semibold text-white">{revenue ? fmtValue(revenue.prior, revenue.unit) : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Change</p>
              <p className={cn("mt-2 text-2xl font-semibold", delta?.tone)}>{delta?.label ?? "—"}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Materiality & confidence</p>
          <div className="mt-3 space-y-3 text-sm text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <span>Materiality</span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1", signal?.material ? "bg-sky-500/15 text-sky-200 ring-sky-400/20" : "bg-white/5 text-slate-300 ring-white/10")}>{signal?.material ? "Material" : "Not material"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Severity</span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1", severityTone(signal?.severity, signal?.material))}>{signal?.severity ?? "n/a"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Confidence</span>
              <span className="text-base font-semibold text-white">{Math.round(insight.confidence.overall * 100)}%</span>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Severity is sourced from backend signal detection. Confidence comes from deterministic scoring, not from the narrative layer.
          </p>
        </div>
      </div>
    </div>
  );
}

function DriverSection({ insight }: { insight: InsightWithPersona }) {
  const drivers = [...insight.drivers].sort((a, b) => driverScore(b) - driverScore(a));
  const maxScore = Math.max(...drivers.map(driverScore), 1);

  return (
    <SectionCard
      eyebrow="WHY did it happen?"
      title="Driver analysis"
      description="Ranked backend driver results rendered as horizontal bars. Association rows are labeled separately from contribution rows when the backend uses correlation-based evidence."
      icon={<BarChart3 className="h-5 w-5 text-cyan-200" />}
    >
      <div className="space-y-4">
        {drivers.map((driver) => {
          const score = driverScore(driver);
          const label = methodLabel(driver);
          const primaryMetric = driverMetricValue(driver);
          const detailValue = driverDetailValue(driver);
          return (
            <div key={driver.driver_id} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{driver.label}</h3>
                    <Pill>{driver.method.replace(/_/g, " ")}</Pill>
                    <Pill>{label}</Pill>
                    <Pill>{Math.round(driver.confidence * 100)}% confidence</Pill>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        driver.direction === "negative" ? "bg-rose-400/90" : "bg-emerald-400/90"
                      )}
                      style={{ width: `${(score / maxScore) * 100}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className={cn("rounded-full px-2.5 py-1 font-medium ring-1", driver.direction === "negative" ? "bg-rose-500/15 text-rose-200 ring-rose-400/20" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20")}>{primaryMetric}</span>
                    {detailValue && <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-slate-200">{detailValue}</span>}
                    {driver.correlation !== undefined && <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-slate-200">correlation {driver.correlation >= 0 ? "+" : ""}{driver.correlation.toFixed(3)}</span>}
                    {driver.p_value !== undefined && <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-slate-200">p-value {driver.p_value.toFixed(4)}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function EvidenceSection({ insight }: { insight: InsightWithPersona }) {
  return (
    <SectionCard
      eyebrow="WHAT evidence supports it?"
      title="Evidence"
      description="Every evidence item returned by the API is shown below, with source, finding, value, method, and timestamp when available."
      icon={<Database className="h-5 w-5 text-cyan-200" />}
    >
      <div className="grid gap-3">
        {insight.evidence.map((ev) => (
          <article key={ev.ev_id} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill>{ev.source.replace(/_/g, " ")}</Pill>
                  <Pill>{ev.method.replace(/_/g, " ")}</Pill>
                  <Pill>{ev.type.replace(/_/g, " ")}</Pill>
                </div>
                <p className="mt-3 text-sm font-medium leading-6 text-white">{ev.finding}</p>
              </div>
              <div className="grid min-w-[180px] gap-2 text-xs text-slate-300">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-slate-400">Value</p>
                  <p className="mt-1 font-semibold text-white">{evidenceValue(ev)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-slate-400">Freshness / timestamp</p>
                  <p className="mt-1 font-semibold text-white">{formatTimestamp(ev.timestamp)}</p>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}

function ConfidenceSection({ insight }: { insight: InsightWithPersona }) {
  const components = [
    ["data_quality", "Data quality"],
    ["freshness", "Freshness"],
    ["stat_strength", "Statistical strength"],
    ["evidence_coverage", "Evidence coverage"],
  ] as const;

  return (
    <SectionCard
      eyebrow="CONFIDENCE"
      title="Final confidence score"
      description="This score is surfaced prominently so operators can quickly judge whether the investigation is actionable or should remain tentative."
      icon={<Gauge className="h-5 w-5 text-cyan-200" />}
    >
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
          <div className="flex items-end gap-4">
            <div className={cn("flex h-24 w-24 items-center justify-center rounded-full border text-3xl font-semibold ring-1", confidenceTone(insight.confidence.overall).bg, confidenceTone(insight.confidence.overall).fg, confidenceTone(insight.confidence.overall).ring)}>
              {Math.round(insight.confidence.overall * 100)}%
            </div>
            <div>
              <p className="text-sm font-semibold capitalize text-white">{insight.confidence.bucket} confidence</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">Weighted fusion of deterministic components from the backend.</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
          {components.map(([key, label]) => {
            const value = insight.confidence.components[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-36 text-sm text-slate-300">{label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(value * 100).toFixed(0)}%` }} />
                </div>
                <span className="w-12 text-right text-sm font-medium text-white">{(value * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function MethodTransparency({ insight }: { insight: InsightWithPersona }) {
  const stages = [
    { label: "SQL", detail: "KPI calculation", icon: <Database className="h-4 w-4" /> },
    { label: "Rules + Statistics", detail: "Detection", icon: <ShieldAlert className="h-4 w-4" /> },
    { label: "Statistics", detail: "Driver analysis", icon: <BarChart3 className="h-4 w-4" /> },
    { label: "Evidence", detail: "Grounding", icon: <Layers3 className="h-4 w-4" /> },
    { label: "Deterministic scoring", detail: "Confidence", icon: <Activity className="h-4 w-4" /> },
    { label: "LLM / Template", detail: "Narrative", icon: <Bot className="h-4 w-4" /> },
  ];

  return (
    <SectionCard
      eyebrow="METHOD TRANSPARENCY"
      title="How the insight is built"
      description="The pipeline is deliberately explicit so operators can distinguish hard numbers from narrative synthesis."
      icon={<Workflow className="h-5 w-5 text-cyan-200" />}
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage, index) => (
            <div key={stage.label} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-cyan-200">{stage.icon}</span>
                {stage.label}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <span className="font-medium text-slate-100">→</span>
                <span>{stage.detail}</span>
              </div>
              {index === stages.length - 1 && <p className="mt-3 text-xs leading-5 text-slate-400">LLM is not used as the source of quantitative truth.</p>}
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-50">
          Quantitative fields in this view come from the backend insight payload. Narrative text is presentation-only and never overrides the numeric result set.
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Narrative layer</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">{insight.narrative}</p>
        </div>
      </div>
    </SectionCard>
  );
}

function AbstentionCallout({ insight }: { insight: InsightWithPersona }) {
  if (!insight.abstention) return null;

  const sparse = insight.abstention.reason === "abstain_sparse_history";
  const contradictory = insight.abstention.reason === "abstain_contradictory";
  const title = sparse ? "INSIGHT WITHHELD" : contradictory ? "ABSTAINED" : "INSIGHT WITHHELD";
  const message = sparse ? "Insufficient historical evidence." : contradictory ? "Conflicting evidence." : insight.abstention.message;

  return (
    <section className="rounded-[1.75rem] border border-amber-400/30 bg-amber-500/10 p-5 text-amber-50">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-100">
          <CircleSlash2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-100/80">{title}</p>
            <p className="mt-2 text-sm leading-6 text-amber-50">{message}</p>
            <p className="mt-2 text-xs leading-5 text-amber-100/80">{insight.abstention.message}</p>
          </div>
          {insight.abstention.data_days !== undefined && (
            <Pill className="border-amber-200/20 bg-amber-500/15 text-amber-50">Only {insight.abstention.data_days} days of history</Pill>
          )}
          {insight.abstention.competing_hypotheses?.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {insight.abstention.competing_hypotheses.map((hypothesis) => (
                <div key={hypothesis.hypothesis} className="rounded-2xl border border-amber-200/15 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-amber-50">{hypothesis.hypothesis}</p>
                    <Pill className="border-amber-200/20 bg-amber-500/15 text-amber-50">{hypothesis.support_pct}% support</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-amber-100/90">Competing hypothesis: {hypothesis.contradiction}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ActionPanel({ insight, selected }: { insight: InsightWithPersona; selected: boolean }) {
  const personaLabel = insight.persona === "cfo" ? "CFO" : "Supply Chain Manager";

  return (
    <div className={cn("rounded-[1.75rem] border p-5", selected ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/10 bg-white/5") }>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{personaLabel}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">What should we do?</h3>
          <p className="mt-1 text-sm text-slate-300">{selected ? "Selected lens" : "Comparison lens"}</p>
        </div>
        <Pill className={selected ? "border-cyan-200/20 bg-cyan-400/15 text-cyan-50" : ""}>{insight.actions.length} actions</Pill>
      </div>

      {insight.abstention ? (
        <div className="mt-5">
          <AbstentionCallout insight={insight} />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {insight.actions.map((action) => (
            <article key={action.action_id} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{action.driver_label}</Pill>
                <Pill>{action.lever}</Pill>
                <Pill>{action.owner}</Pill>
                <Pill>{Math.round(action.confidence * 100)}% confidence</Pill>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-200">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Driver → Lever → Action</p>
                  <p className="mt-2 leading-6 text-white">{action.action}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Expected impact</p>
                  <p className="mt-2 leading-6 text-emerald-200">{action.expected_impact}</p>
                </div>
              </div>
            </article>
          ))}
          {!insight.actions.length && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300">No recommendation is released for this lens.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CurrentInsightClient({ scenario, persona }: { scenario?: Scenario; persona?: Persona }) {
  const router = useRouter();
  const [selected, setSelected] = useState<InsightWithPersona | null>(null);
  const [peer, setPeer] = useState<InsightWithPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentScenario = scenario ?? "revenue_decline";
  const currentPersona = persona ?? "cfo";
  const otherPersona: Persona = currentPersona === "cfo" ? "supply_chain_manager" : "cfo";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const selectedResult = await api.insight(currentScenario, currentPersona);
        if (cancelled) return;
        setSelected({ ...selectedResult, persona: currentPersona });
      } catch (reason) {
        if (!cancelled) {
          setSelected(null);
          setError(String(reason));
        }
      }

      try {
        const peerResult = await api.insight(currentScenario, otherPersona);
        if (cancelled) return;
        setPeer({ ...peerResult, persona: otherPersona });
      } catch {
        if (!cancelled) setPeer(null);
      }

      setLoading(false);
    }

    load().catch((err) => {
      if (!cancelled) {
        setError(String(err));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentScenario, currentPersona, otherPersona]);

  const scenarioMeta = useMemo(
    () => SCENARIOS.find((item) => item.value === currentScenario) ?? SCENARIOS[0],
    [currentScenario]
  );

  const setQuery = (nextScenario: Scenario, nextPersona: Persona) => {
    const params = new URLSearchParams();
    params.set("scenario", nextScenario);
    params.set("persona", nextPersona);
    router.replace(`/insights/current?${params.toString()}`);
  };

  const activeInsight = selected ?? peer;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.15),_transparent_32%),linear-gradient(180deg,#050b16_0%,#07111f_48%,#040815_100%)] text-slate-100">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:42px_42px] opacity-30" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/10 bg-slate-950/70 px-5 py-4 shadow-[0_20px_70px_rgba(2,8,23,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/80">NEXUS.ai investigation console</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Current insight</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">Enterprise decision-intelligence view for answering what happened, why it happened, what evidence supports it, and what to do next.</p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 p-2">
                {SCENARIOS.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={item.value === currentScenario ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setQuery(item.value, currentPersona)}
                    className={cn(
                      "rounded-full px-4",
                      item.value === currentScenario
                        ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                        : "text-slate-200 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 p-2">
                {PERSONAS.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={item.value === currentPersona ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setQuery(currentScenario, item.value)}
                    className={cn(
                      "rounded-full px-4",
                      item.value === currentPersona
                        ? "bg-white text-slate-950 hover:bg-cyan-50"
                        : "text-slate-200 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            Backend error: {error}
          </div>
        )}

        {loading && !activeInsight ? (
          <div className="grid gap-6 lg:grid-cols-[1.55fr_0.95fr]">
            <div className="space-y-6">
              <div className="h-64 animate-pulse rounded-[2rem] border border-white/10 bg-white/5" />
              <div className="h-72 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
              <div className="h-96 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
            </div>
            <div className="space-y-6">
              <div className="h-72 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
              <div className="h-72 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
            </div>
          </div>
        ) : activeInsight ? (
          <>
            <InsightBanner insight={activeInsight} />
            {activeInsight.abstention && <AbstentionCallout insight={activeInsight} />}

            <div className="grid gap-6 lg:grid-cols-[1.55fr_0.95fr]">
              <div className="space-y-6">
                <RevenueSummary insight={activeInsight} />
                <DriverSection insight={activeInsight} />
                <EvidenceSection insight={activeInsight} />
                <div className="grid gap-6 xl:grid-cols-2">
                  <ActionPanel insight={selected ?? activeInsight} selected />
                  {peer ? <ActionPanel insight={peer} selected={false} /> : <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">Peer persona comparison is unavailable.</div>}
                </div>
              </div>

              <div className="space-y-6">
                <ConfidenceSection insight={activeInsight} />
                <MethodTransparency insight={activeInsight} />
                <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-200">
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Investigation context</p>
                      <p className="mt-1 text-lg font-semibold text-white">{scenarioMeta.label}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-300">
                    <p>{scenarioMeta.subtitle}</p>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Selected persona</p>
                      <p className="mt-1 font-semibold text-white">{currentPersona === "cfo" ? "CFO" : "Supply Chain Manager"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Evidence set size</p>
                      <p className="mt-1 font-semibold text-white">{activeInsight.evidence.length} items</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Driver set size</p>
                      <p className="mt-1 font-semibold text-white">{activeInsight.drivers.length} ranked drivers</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}