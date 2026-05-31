import { useState } from "react";

type StepStatus = "pending" | "running" | "done";

function InfoTip() {
  const [show, setShow] = useState(false);
  return (
    <div className="relative ml-auto">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full font-mono text-[9px]"
        style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}
      >
        i
      </span>
      {show && (
        <div className="absolute right-0 top-6 z-20 rounded-lg p-3 text-[11px] leading-relaxed"
          style={{ width: 340, maxWidth: "80vw", background: "var(--panel-2)", border: "1px solid var(--line)", color: "var(--ink-dim)", boxShadow: "0 12px 36px -10px rgba(0,0,0,0.85)" }}>
          Required agents run automatically to build the map. Optional analyses run only when you open their tab — saving tokens.
        </div>
      )}
    </div>
  );
}

// Required agents run automatically to produce the map.
const REQUIRED = [
  { key: "domain", label: "Domain Extraction" },
  { key: "decompose", label: "Service Decomposition" },
  { key: "dependencies", label: "Dependency Mapping" },
];
// Optional agents run only when the user triggers them.
const OPTIONAL = [
  { key: "review", label: "Risk Audit" },
  { key: "traceability", label: "Traceability Matrix" },
  { key: "roadmap", label: "Migration Roadmap" },
  { key: "competitor", label: "Competitor Intel" },
];

interface Props {
  statuses: Record<string, StepStatus>;
  optionalStatuses: Record<string, StepStatus>;
  active: boolean;
}

function Dot({ status, accent }: { status: StepStatus; accent: string }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ background: `${accent}22`, border: `1px solid ${accent}` }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute h-5 w-5 rounded-full"
          style={{ border: "1px solid var(--amber)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber)" }} />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ border: "1px solid var(--line)" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ink-faint)" }} />
    </span>
  );
}

function Row({ idx, label, status, accent, optional }: {
  idx: string; label: string; status: StepStatus; accent: string; optional?: boolean;
}) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
      style={{
        background: status === "running" ? "rgba(255,179,71,0.04)" : "transparent",
        border: `1px solid ${status === "running" ? "rgba(255,179,71,0.18)" : "transparent"}`,
      }}>
      {status === "running" && <span className="shimmer absolute inset-0 rounded-lg" />}
      <span className="w-5 font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>{idx}</span>
      <Dot status={status} accent={accent} />
      <span className="text-[13px]" style={{
        color: status === "pending" ? "var(--ink-faint)" : "var(--ink)",
        fontWeight: status === "running" ? 600 : 400,
      }}>{label}</span>
      {status === "running" && <span className="ml-auto font-mono text-[10px] accent-amber cursor-blink">working</span>}
      {status === "done" && <span className="ml-auto font-mono text-[10px]" style={{ color: accent }}>ok</span>}
      {status === "pending" && optional && (
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>on demand</span>
      )}
    </div>
  );
}

export default function PipelineConsole({ statuses, optionalStatuses, active }: Props) {
  return (
    <div className="panel panel-glow p-5">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: active ? "var(--amber)" : "var(--ink-faint)" }} />
        <span className="font-mono text-xs tracking-wider" style={{ color: "var(--ink-dim)" }}>AGENT PIPELINE</span>
        <InfoTip />
      </div>

      {/* Required group */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-wider accent-cyan">REQUIRED · AUTO</span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>
      <div className="space-y-0.5">
        {REQUIRED.map((s, i) => (
          <Row key={s.key} idx={String(i + 1).padStart(2, "0")} label={s.label}
            status={statuses[s.key] ?? "pending"} accent="var(--cyan)" />
        ))}
      </div>

      {/* Optional group */}
      <div className="mb-1.5 mt-3 flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-wider" style={{ color: "var(--amber)" }}>OPTIONAL · ON CLICK</span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>
      <div className="space-y-0.5">
        {OPTIONAL.map((s, i) => (
          <Row key={s.key} idx={String(i + 4).padStart(2, "0")} label={s.label}
            status={optionalStatuses[s.key] ?? "pending"} accent="var(--amber)" optional />
        ))}
      </div>
    </div>
  );
}
