import type { Evidence, KPI, Signal } from "./api";
import { cn } from "./utils";

export function formatDate(dateValue: string) {
  const value = new Date(`${dateValue}T00:00:00Z`);
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(dateValue: string) {
  return new Date(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}$${absolute.toFixed(2)}`;
}

export function formatValue(value: number, unit: string) {
  if (unit === "usd") return formatMoney(value);
  if (unit === "pct") return `${(value * 100).toFixed(1)}%`;
  if (unit === "rate") return value.toFixed(2);
  if (unit === "units") return value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toFixed(0);
  return value.toFixed(2);
}

export function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function statusTone(adverse: boolean, severity?: string) {
  if (severity === "high") return adverse ? "bg-rose-500/15 text-rose-200 ring-rose-400/25" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
  if (severity === "medium") return adverse ? "bg-amber-500/15 text-amber-200 ring-amber-400/25" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
  return adverse ? "bg-sky-500/15 text-sky-100 ring-sky-400/25" : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
}

export function confidenceTone(score: number) {
  if (score >= 0.75) return { chip: "bg-emerald-500/15 text-emerald-100 ring-emerald-400/25", bar: "bg-emerald-400" };
  if (score >= 0.5) return { chip: "bg-amber-500/15 text-amber-100 ring-amber-400/25", bar: "bg-amber-400" };
  return { chip: "bg-rose-500/15 text-rose-100 ring-rose-400/25", bar: "bg-rose-400" };
}

export function isAdverse(kpi: KPI) {
  return (kpi.direction === "higher_is_better" && kpi.delta_pct < 0) || (kpi.direction === "lower_is_better" && kpi.delta_pct > 0);
}

export function signalForKpi(signals: Signal[], kpiId: string) {
  return signals.find((signal) => signal.kpi_id === kpiId) ?? null;
}

export function evidenceValue(evidence: Evidence) {
  if (evidence.type === "top_mover") return formatMoney(evidence.value);
  if (evidence.type === "inventory_snapshot") return `${(evidence.value * 100).toFixed(1)}%`;
  if (evidence.type === "support_spike") return `${evidence.value > 0 ? "+" : ""}${evidence.value.toFixed(0)} tickets`;
  return String(evidence.value);
}

export function sectionClassName() {
  return "rounded-[1.75rem] border border-white/10 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,8,23,0.4)] backdrop-blur-xl";
}

export function PanelHeader({
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

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200", className)}>
      {children}
    </span>
  );
}

export function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-2xl border border-white/10 bg-white/5", className)} />;
}
