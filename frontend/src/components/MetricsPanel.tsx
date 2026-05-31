import { Gauge, Layers, Boxes } from "lucide-react";
import type { Metrics } from "@/types/architecture";
import InfoDot, { type InfoContent } from "./InfoDot";

const METRICS_INFO: InfoContent = {
  summary: "Derived directly from your service graph using standard architecture formulas — no guesswork:",
  bullets: [
    { term: "Cohesion", desc: "how focused a service is on one job (fewer owned entities + tighter API = higher)" },
    { term: "Coupling looseness", desc: "how independent a service is (drops as it gains dependencies)" },
    { term: "Scalability", desc: "how easily it scales alone, from its data store, minus heavy sync load" },
    { term: "Boundary quality", desc: "how cleanly its business domain is drawn" },
    { term: "Fan-in", desc: "how many services depend on this one (callers)" },
    { term: "Fan-out", desc: "how many services this one depends on" },
  ],
  formula: "boundary = 0.45·cohesion + 0.40·looseness + ownership_bonus",
};

const DDD_INFO: InfoContent = {
  summary: "Domain-Driven Design view — read straight from the decomposition, nothing extra computed:",
  bullets: [
    { term: "Bounded context", desc: "a self-contained business zone the service owns" },
    { term: "Aggregate root", desc: "the primary entity that anchors the service's consistency boundary" },
  ],
};

function bar(v: number) {
  return v >= 75 ? "var(--cyan)" : v >= 50 ? "var(--amber)" : "var(--rose)";
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px]" style={{ color: "var(--ink-dim)" }}>{label}</span>
        <span className="ml-auto font-mono text-[11px]" style={{ color: bar(value) }}>{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: bar(value) }} />
      </div>
    </div>
  );
}

export default function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const s = metrics.summary;
  return (
    <div className="panel panel-glow flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <Gauge size={15} style={{ color: "var(--cyan)" }} />
        <div className="flex-1">
          <div className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
            ARCHITECTURE METRICS
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Cohesion · Coupling · Scalability · DDD
          </div>
        </div>
        <InfoDot content={METRICS_INFO} align="right" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* averages */}
        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg p-4"
          style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
          <MetricBar label="Avg cohesion" value={s.avg_cohesion} />
          <MetricBar label="Avg coupling looseness" value={s.avg_coupling_looseness} />
          <MetricBar label="Avg scalability" value={s.avg_scalability} />
          <MetricBar label="Avg boundary quality" value={s.avg_boundary_quality} />
        </div>

        {/* per-service */}
        <div className="mb-2 flex items-center gap-1.5">
          <Layers size={12} style={{ color: "var(--ink-faint)" }} />
          <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>PER SERVICE</span>
        </div>
        <div className="space-y-2.5">
          {metrics.ranking.map((m) => (
            <div key={m.id} className="rounded-lg p-3.5" style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{m.name}</span>
                <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  fan-in {m.fan_in} · fan-out {m.fan_out}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <MetricBar label="Cohesion" value={m.cohesion} />
                <MetricBar label="Coupling looseness" value={m.coupling_looseness} />
                <MetricBar label="Scalability" value={m.scalability} />
                <MetricBar label="Boundary quality" value={m.boundary_quality} />
              </div>
              <p className="mt-3 text-[10px] leading-snug" style={{ color: "var(--ink-faint)" }}>
                scaling: {m.scalability_note}
              </p>
            </div>
          ))}
        </div>

        {/* DDD view */}
        <div className="mb-2 mt-4 flex items-center gap-1.5">
          <Boxes size={12} style={{ color: "var(--violet)" }} />
          <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
            DOMAIN-DRIVEN DESIGN VIEW
          </span>
          <InfoDot content={DDD_INFO} align="left" />
        </div>
        <div className="space-y-1.5">
          {metrics.ranking.map((m) => (
            <div key={m.id} className="rounded-md px-3 py-2"
              style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px]"
                  style={{ background: "rgba(139,124,255,0.12)", color: "var(--violet)", border: "1px solid rgba(139,124,255,0.4)" }}>
                  {m.bounded_context}
                </span>
                <span className="text-[11px]" style={{ color: "var(--ink-dim)" }}>
                  aggregate root: <span style={{ color: "var(--ink)" }}>{m.aggregate_root}</span>
                </span>
              </div>
              {m.owns_entities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1" title={m.owns_entities.join(", ")}>
                  <span className="font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>owns:</span>
                  {m.owns_entities.map((e) => (
                    <span key={e} className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--line-soft)", color: "var(--ink-dim)" }}>
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
