"use client";

import { sectionClassName, PanelHeader, SkeletonBlock, Chip } from "@/lib/dashboard-utils";
import { useDashboardParams } from "@/lib/use-dashboard-params";
import { GitBranch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type LineageGraph } from "@/lib/api";

const COLUMNS = ["source", "staging", "transform", "fact", "contract", "observation"] as const;

export default function LineagePage() {
  const { scenario } = useDashboardParams();
  const [kpiId, setKpiId] = useState("revenue");
  const [graph, setGraph] = useState<LineageGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await api.lineage(kpiId, scenario, { signal: controller.signal });
        if (!cancelled) setGraph(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [kpiId, scenario]);

  const layout = useMemo(() => {
    if (!graph) return { positions: new Map<string, { x: number; y: number }>(), width: 1100, height: 420 };
    const grouped = new Map<string, typeof graph.nodes>();
    for (const col of COLUMNS) grouped.set(col, []);
    for (const node of graph.nodes) {
      const key = COLUMNS.includes(node.node_type as (typeof COLUMNS)[number]) ? node.node_type : "transform";
      grouped.get(key)?.push(node);
    }
    const positions = new Map<string, { x: number; y: number }>();
    let maxRows = 1;
    COLUMNS.forEach((col, colIdx) => {
      const nodes = grouped.get(col) ?? [];
      maxRows = Math.max(maxRows, nodes.length);
      nodes.forEach((node, row) => {
        positions.set(node.node_id, { x: 40 + colIdx * 180, y: 36 + row * 78 });
      });
    });
    return { positions, width: 1100, height: Math.max(420, 80 + maxRows * 78) };
  }, [graph]);

  return (
    <div className="space-y-6">
      <section className={sectionClassName() + " p-5"}>
        <PanelHeader
          eyebrow="LINEAGE"
          title="Source → transform → KPI"
          description="Directed graph from DuckDB lineage_nodes / lineage_edges. Edges are loads_into, transforms_into, or computes_from."
          icon={<GitBranch className="h-5 w-5" />}
        />
        <div className="mb-4 flex flex-wrap gap-2">
          {["revenue", "units_sold", "average_selling_price", "inventory_availability", "on_time_delivery", "customer_complaints", "marketing_spend"].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setKpiId(id)}
              className={`rounded-full px-3 py-1 text-xs ${kpiId === id ? "bg-cyan-500 text-slate-950" : "border border-white/10 bg-white/5 text-slate-200"}`}
            >
              {id.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {loading ? <SkeletonBlock className="h-96 w-full" /> : null}
        {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
        {graph && !loading ? (
          <>
            <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-3">
              <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="min-w-[980px] w-full">
                {graph.edges.map((edge, idx) => {
                  const from = layout.positions.get(edge.from);
                  const to = layout.positions.get(edge.to);
                  if (!from || !to) return null;
                  const x1 = from.x + 150;
                  const y1 = from.y + 22;
                  const x2 = to.x;
                  const y2 = to.y + 22;
                  const mid = (x1 + x2) / 2;
                  return (
                    <path
                      key={`${edge.from}-${edge.to}-${idx}`}
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="rgba(34,211,238,0.45)"
                      strokeWidth="1.5"
                    />
                  );
                })}
                {graph.nodes.map((node) => {
                  const pos = layout.positions.get(node.node_id);
                  if (!pos) return null;
                  return (
                    <g key={node.node_id} transform={`translate(${pos.x}, ${pos.y})`}>
                      <rect width="150" height="56" rx="12" fill="rgba(15,23,42,0.95)" stroke="rgba(148,163,184,0.25)" />
                      <text x="10" y="18" fill="#67e8f9" fontSize="9">{node.node_type}</text>
                      <text x="10" y="36" fill="#e2e8f0" fontSize="10">
                        {node.display_name.length > 22 ? `${node.display_name.slice(0, 20)}…` : node.display_name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <Chip className="border-white/10 bg-white/5 text-slate-200">{graph.nodes.length} nodes</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">{graph.edges.length} edges</Chip>
              <Chip className="border-white/10 bg-white/5 text-slate-200">{graph.observation_id}</Chip>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
