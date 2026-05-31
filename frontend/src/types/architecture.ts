// Types mirror the backend's `result` payload exactly.

export interface FunctionalArea {
  name: string;
  description: string;
  capabilities: string[];
}

export interface Service {
  id: string;
  name: string;
  responsibility: string;
  bounded_context: string;
  owns_entities: string[];
  key_apis: string[];
  data_store: string;
  integrations?: string[];
  rationale: string;
}

export interface Edge {
  from: string;
  to: string;
  type: "sync" | "async";
  protocol: string;
  reason: string;
}

export interface CompetitorService {
  name: string;
  purpose: string;
  source_hint: string;
}

export interface Competitor {
  competitor: string;
  why_relevant: string;
  known_services: CompetitorService[];
  insights: string[];
}

export interface Risk {
  id: string;
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  affected_services: string[];
  explanation: string;
  recommendation: string;
}

export interface Review {
  score: number | null;
  grade: string;
  summary: string;
  risks: Risk[];
  strengths: string[];
}

export interface RoadmapPhase {
  phase: number;
  name: string;
  goal: string;
  services: string[];
  milestone: string;
  risk_note: string;
}

export interface Roadmap {
  approach: string;
  phases: RoadmapPhase[];
}

export interface ServiceResilience {
  id: string;
  name: string;
  impacts: string[];
  impact_count: number;
}

export interface Resilience {
  resilience_score: number;
  per_service: Record<string, ServiceResilience>;
  ranking: ServiceResilience[];
  single_points_of_failure: string[];
  total_services: number;
}

export interface ServiceMetric {
  id: string;
  name: string;
  bounded_context: string;
  aggregate_root: string;
  owns_entities: string[];
  cohesion: number;
  fan_in: number;
  fan_out: number;
  coupling_looseness: number;
  scalability: number;
  scalability_note: string;
  sync_inbound: number;
  boundary_quality: number;
}

export interface Metrics {
  per_service: Record<string, ServiceMetric>;
  ranking: ServiceMetric[];
  summary: {
    avg_cohesion: number;
    avg_coupling_looseness: number;
    avg_scalability: number;
    avg_boundary_quality: number;
  };
  bounded_contexts: string[];
  total_services: number;
}

export interface TraceRow {
  requirement: string;
  area: string;
  service_ids: string[];
  coverage: "covered" | "partial" | "gap";
}

export interface Traceability {
  rows: TraceRow[];
  coverage_pct: number;
  gaps: string[];
}

export interface Architecture {
  app_type: string;
  summary: string;
  actors: string[];
  functional_areas: FunctionalArea[];
  services: Service[];
  edges: Edge[];
  shared_concerns: string[];
  competitor?: Competitor;
  review?: Review;
  roadmap?: Roadmap;
  resilience?: Resilience;
  metrics?: Metrics;
  traceability?: Traceability;
  preprocess?: {
    original_chars: number;
    digest_chars: number;
    compressed: boolean;
  };
}

// One SSE event from the pipeline.
export interface StepEvent {
  step: string;
  label?: string;
  status: "running" | "done" | "complete" | "error";
  data?: unknown;
  message?: string;
}

export const PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: "domain", label: "Domain Extraction" },
  { key: "decompose", label: "Service Decomposition" },
  { key: "dependencies", label: "Dependency Mapping" },
  { key: "review", label: "Risk Audit" },
  { key: "roadmap", label: "Migration Roadmap" },
  { key: "competitor", label: "Competitor Intel" },
  { key: "synthesis", label: "Synthesis" },
];
