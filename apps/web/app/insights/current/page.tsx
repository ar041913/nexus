import type { Metadata } from "next";
import { Suspense } from "react";
import CurrentInsightClient from "./current-insight-client";

export const metadata: Metadata = {
  title: "NEXUS.ai | Current Insight",
  description: "Current investigation view with KPI summary, drivers, evidence, confidence, and actions.",
};

type SearchParams = {
  scenario?: string | string[];
  persona?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function LoadingShell() {
  return (
    <div className="min-h-screen bg-[#07111f] px-4 py-8 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="h-40 animate-pulse rounded-[2rem] border border-white/10 bg-white/5" />
        <div className="grid gap-6 lg:grid-cols-[1.55fr_0.95fr]">
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
            <div className="h-72 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
            <div className="h-96 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
          </div>
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
            <div className="h-72 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolved = await searchParams;
  const scenario = firstValue(resolved?.scenario) ?? "revenue_decline";
  const persona = firstValue(resolved?.persona) ?? "cfo";

  return (
    <Suspense fallback={<LoadingShell />}>
      <CurrentInsightClient scenario={scenario === "sparse_history" || scenario === "contradictory" ? scenario : "revenue_decline"} persona={persona === "supply_chain_manager" ? "supply_chain_manager" : "cfo"} />
    </Suspense>
  );
}