const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Persona = "cfo" | "supply_chain_manager";
export type Scenario = "revenue_decline" | "sparse_history" | "contradictory" | "role_based_access";

export interface KPI {
  kpi_id: string;
  name: string;
  unit: string;
  direction: string;
  current: number;
  prior: number;
  delta: number;
  delta_pct: number;
  period: string;
  prior_period: string;
  grain?: string;
  supported_grains?: string[];
  formula_type?: string;
  owner?: string;
}

export interface Driver {
  driver_id: string;
  label: string;
  method: string;
  effect_usd?: number;
  contribution_pct: number;
  direction: string;
  confidence: number;
  correlation?: number;
  p_value?: number;
  kpi_delta_pct?: number;
}

export interface Evidence {
  ev_id: string;
  type: string;
  source: string;
  finding: string;
  value: number;
  method: string;
  timestamp: string;
}

export interface Action {
  action_id: string;
  lever: string;
  action: string;
  owner: string;
  expected_impact: string;
  confidence: number;
  priority: string;
  driver_id: string;
  driver_label: string;
}

export interface FeedbackRecord {
  id: string;
  insight_id: string;
  persona: string;
  rating: string;
  comment: string;
  action_taken: string;
  created_at: string;
}

export interface Confidence {
  overall: number;
  bucket: string;
  components: {
    data_quality: number;
    freshness: number;
    stat_strength: number;
    evidence_coverage: number;
  };
}

export interface Hypothesis {
  hypothesis: string;
  support_pct: number;
  contradiction: string;
}

export interface Abstention {
  verdict: string;
  reason: string;
  message: string;
  data_days?: number;
  competing_hypotheses?: Hypothesis[];
}

export interface Signal {
  kpi_id: string;
  delta_pct: number;
  z_score: number | null;
  material: boolean;
  is_adverse: boolean;
  severity: string;
}

export interface Insight {
  insight_id: string;
  signal_id?: string;
  scenario: string;
  scenario_label: string;
  persona: string;
  period: { current_start: string; current_end: string; prior_start: string; prior_end: string };
  kpis: KPI[];
  signals: Signal[];
  drivers: Driver[];
  evidence: Evidence[];
  confidence: Confidence;
  abstention: Abstention | null;
  actions: Action[];
  narrative: string;
  generated_at: string;
  access?: { persona: string; hidden_kpis: string[]; note: string };
  masked_fields?: string[];
}

export interface LineageNode {
  node_id: string;
  node_type: string;
  display_name: string;
  metadata: Record<string, unknown>;
}

export interface LineageGraph {
  kpi_id: string;
  observation_id: string;
  nodes: LineageNode[];
  edges: { from: string; to: string; type: string }[];
}

export interface SimulationResult {
  method: string;
  assumptions: string[];
  total_cost_usd: number;
  time_to_effect_days: number;
  actions: (Action & {
    delta_multiplier: number;
    baseline_impact: string;
    simulated_recovery_pp: number;
    simulated_cost_usd: number;
    applied: boolean;
  })[];
  kpi_impacts: {
    kpi_id: string;
    name: string;
    unit: string;
    baseline_delta_pct: number;
    simulated_delta_pct: number;
    recovery_pp: number;
  }[];
  insight_id: string;
  persona: string;
  scenario: string;
}

export interface FreshnessRow {
  kpi_id: string;
  source_name: string;
  grain: string;
  cadence: string;
  sla_hours: number;
  actual_lag_hours: number;
  is_within_sla: boolean;
  notes: string;
}

export interface TelemetrySummary {
  request_count: number;
  span_count: number;
  latency_ms: { p50: number | null; p95: number | null; max: number | null };
  llm: {
    model_calls: number;
    tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
    fallback_count: number;
    recent: Record<string, unknown>[];
  };
  pipeline_stage_ms: Record<string, number>;
  recent_spans: { span_name: string; duration_ms: number; attributes: Record<string, unknown> }[];
  audit?: Record<string, unknown>[];
}

export interface TimePoint {
  date: string;
  value: number;
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { 
    cache: "no-store",
    headers: { 'Accept': 'application/json' },
    ...init 
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API POST ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  kpis:       (scenario: Scenario, persona: Persona, init?: RequestInit) =>
    get<KPI[]>(`/api/kpis?scenario=${scenario}&persona=${persona}`, init),
  timeseries: (kpi_id: string, days = 90, init?: RequestInit) => get<TimePoint[]>(`/api/kpis/${kpi_id}/timeseries?days=${days}`, init),
  insight:    (scenario: Scenario, persona: Persona, init?: RequestInit) =>
    get<Insight>(`/api/insights/current?scenario=${scenario}&persona=${persona}`, init),
  insightById:(id: string, scenario: Scenario, persona: Persona, init?: RequestInit) =>
    get<Insight>(`/api/insights/${id}?scenario=${scenario}&persona=${persona}`, init),
  actions:    (scenario: Scenario, persona: Persona, init?: RequestInit) =>
    get<{ actions: Action[]; abstention: Abstention | null }>(`/api/actions?scenario=${scenario}&persona=${persona}`, init),
  lineage:    (kpi_id: string, scenario: Scenario, init?: RequestInit) =>
    get<LineageGraph>(`/api/kpis/${kpi_id}/lineage?scenario=${scenario}`, init),
  freshness:  (init?: RequestInit) => get<FreshnessRow[]>("/api/data/freshness", init),
  quality:    (init?: RequestInit) => get<Record<string, unknown>[]>("/api/data/quality", init),
  simulate:   (body: { scenario: Scenario; persona: Persona; lever_adjustments: { action_id: string; delta_multiplier: number }[] }, init?: RequestInit) =>
    post<SimulationResult>("/api/simulate", body, init),
  telemetry:  (init?: RequestInit) => get<TelemetrySummary>("/api/telemetry/summary", init),
  feedbackList: (init?: RequestInit) => get<FeedbackRecord[]>(`/api/feedback`, init),
  feedback:   (body: { insight_id: string; persona: string; rating: string; comment?: string; action_taken?: string }, init?: RequestInit) =>
    post(`/api/feedback`, body, init),
  health:     (init?: RequestInit) => get<{ status: string }>("/health", init),
};
