"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Persona, type Scenario } from "@/lib/api";
import { cn } from "@/lib/utils";

type HealthState = "loading" | "ok" | "error";

const SCENARIOS: { value: Scenario; label: string; short: string }[] = [
  { value: "revenue_decline", label: "Revenue Decline", short: "Revenue Decline" },
  { value: "sparse_history", label: "Sparse History", short: "Sparse History" },
  { value: "contradictory", label: "Contradictory Evidence", short: "Contradictory Evidence" },
  { value: "role_based_access", label: "Role-Based Access", short: "Role Access" },
];

const PERSONAS: { value: Persona; label: string; short: string; icon: string }[] = [
  { value: "cfo", label: "CFO", short: "CFO", icon: "💼" },
  { value: "supply_chain_manager", label: "Supply Chain Manager", short: "Supply Chain Manager", icon: "🏭" },
];

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/insights", label: "Insights", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/simulation", label: "Simulation", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { href: "/actions", label: "Actions", icon: <Sparkles className="h-4 w-4" /> },
  { href: "/feedback", label: "Feedback", icon: <MessageSquare className="h-4 w-4" /> },
  { href: "/data-quality", label: "Data Quality", icon: <HeartPulse className="h-4 w-4" /> },
  { href: "/lineage", label: "Lineage", icon: <GitBranch className="h-4 w-4" /> },
  { href: "/telemetry", label: "Telemetry", icon: <Activity className="h-4 w-4" /> },
];

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [scenario, setScenario] = useState<Scenario>(
    (searchParams.get("scenario") as Scenario) || "revenue_decline"
  );
  const [persona, setPersona] = useState<Persona>(
    (searchParams.get("persona") as Persona) || "cfo"
  );
  const [health, setHealth] = useState<HealthState>("loading");

  // Health check
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    api
      .health({ signal: controller.signal })
      .then(() => {
        if (!cancelled) setHealth("ok");
      })
      .catch(() => {
        if (!cancelled) setHealth("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // Sync URL params to state
  useEffect(() => {
    const urlScenario = searchParams.get("scenario") as Scenario;
    const urlPersona = searchParams.get("persona") as Persona;
    
    if (urlScenario && urlScenario !== scenario) {
      setScenario(urlScenario);
    }
    if (urlPersona && urlPersona !== persona) {
      setPersona(urlPersona);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const onScenarioChange = (next: Scenario) => {
    setScenario(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("scenario", next);
    params.set("persona", persona);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const onPersonaChange = (next: Persona) => {
    setPersona(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("scenario", scenario);
    params.set("persona", next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const buildNavHref = (href: string) => {
    const params = new URLSearchParams();
    params.set("scenario", scenario);
    params.set("persona", persona);
    return `${href}?${params.toString()}`;
  };

  const personaLabel = PERSONAS.find((item) => item.value === persona)?.label ?? persona;
  const selectedScenarioLabel = SCENARIOS.find((item) => item.value === scenario)?.label ?? scenario;

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.14),_transparent_30%),linear-gradient(180deg,#050b16_0%,#07111f_48%,#040815_100%)] text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden xl:flex xl:h-screen xl:w-72 xl:flex-col xl:overflow-y-auto xl:border-r xl:border-white/10 xl:bg-slate-950/90 xl:px-5 xl:py-5">
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
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={buildNavHref(item.href)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-cyan-500/15 text-white ring-1 ring-cyan-400/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <span className={cn(isActive ? "text-cyan-200" : "text-cyan-200/90")}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
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
          <p className="mt-2 text-sm font-semibold text-white">{selectedScenarioLabel}</p>
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

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl xl:hidden">
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto xl:h-screen">
        <div className="mx-auto max-w-[1540px] px-4 py-4 pt-[180px] sm:px-6 lg:px-8 xl:py-6 xl:pt-6">
          {/* Desktop Global Header */}
          <div className="mb-5 hidden xl:flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_20px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/75">System Healthy</p>
              <p className="mt-1 truncate text-sm text-slate-300">Scenario: {selectedScenarioLabel} · Persona: {personaLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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

          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-950 text-white">Loading...</div>}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
