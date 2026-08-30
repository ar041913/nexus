"use client";

import { sectionClassName, PanelHeader, SkeletonBlock, Chip } from "@/lib/dashboard-utils";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type TelemetrySummary } from "@/lib/api";

export default function TelemetryPage() {
  const [data, setData] = useState<TelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.telemetry()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <SkeletonBlock className="h-96 w-full" />;
  if (!data) {
    return <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-5 text-rose-100">Telemetry is unavailable.</div>;
  }

  return (
    <div className="space-y-6">
      <section className={sectionClassName() + " p-5"}>
        <PanelHeader
          eyebrow="TELEMETRY"
          title="Latency, model calls, tokens, cost"
          description="API request spans plus pipeline stages. LLM cost is estimated from token usage; template fallback is counted when LLM_API_KEY is absent."
          icon={<Activity className="h-5 w-5" />}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Requests" value={String(data.request_count)} />
          <Metric label="p50 latency" value={data.latency_ms.p50 != null ? `${data.latency_ms.p50} ms` : "—"} />
          <Metric label="p95 latency" value={data.latency_ms.p95 != null ? `${data.latency_ms.p95} ms` : "—"} />
          <Metric label="LLM cost" value={`$${data.llm.cost_usd.toFixed(4)}`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip className="border-white/10 bg-white/5 text-slate-200">Model calls {data.llm.model_calls}</Chip>
          <Chip className="border-white/10 bg-white/5 text-slate-200">Tokens {data.llm.tokens}</Chip>
          <Chip className="border-white/10 bg-white/5 text-slate-200">Fallbacks {data.llm.fallback_count}</Chip>
          <Chip className="border-white/10 bg-white/5 text-slate-200">Spans {data.span_count}</Chip>
        </div>
      </section>
      <section className={sectionClassName() + " p-5"}>
        <h3 className="text-lg font-semibold text-white">Recent spans</h3>
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          {data.recent_spans.slice().reverse().map((span, idx) => (
            <div key={`${span.span_name}-${idx}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span>{span.span_name}</span>
              <span className="text-cyan-100">{span.duration_ms} ms</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
