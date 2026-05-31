import { GitMerge } from "lucide-react";
import type { Traceability, Service } from "@/types/architecture";
import InfoDot, { type InfoContent } from "./InfoDot";

const INFO: InfoContent = {
  summary: "Maps every functional requirement from your document to the service(s) that satisfy it — proving coverage and surfacing gaps.",
  bullets: [
    { term: "Covered", desc: "at least one service fully owns this requirement" },
    { term: "Partial", desc: "handled, but spread across services or incomplete" },
    { term: "Gap", desc: "no service currently owns this requirement" },
  ],
  formula: "coverage % = requirements with ≥1 mapped service ÷ total requirements",
};

const COV: Record<string, string> = {
  covered: "var(--cyan)",
  partial: "var(--amber)",
  gap: "var(--rose)",
};

export default function TraceabilityPanel({ data, services }: { data: Traceability; services: Service[] }) {
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="panel panel-glow flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <GitMerge size={14} style={{ color: "var(--cyan)" }} />
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
              TRACEABILITY MATRIX
            </span>
            <InfoDot content={INFO} align="left" />
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Requirements → services coverage
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold"
            style={{ color: data.coverage_pct >= 90 ? "var(--cyan)" : data.coverage_pct >= 70 ? "var(--amber)" : "var(--rose)" }}>
            {data.coverage_pct}%
          </div>
          <div className="font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>covered</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {data.gaps.length > 0 && (
          <div className="mb-3 rounded-lg p-2.5" style={{ background: "rgba(255,107,138,0.06)", border: "1px solid rgba(255,107,138,0.25)" }}>
            <span className="font-mono text-[10px]" style={{ color: "var(--rose)" }}>COVERAGE GAPS: </span>
            <span className="text-[11px]" style={{ color: "var(--ink-dim)" }}>{data.gaps.join("; ")}</span>
          </div>
        )}

        <div className="space-y-1.5">
          {data.rows.map((row, i) => (
            <div key={i} className="rounded-lg p-2.5" style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COV[row.coverage] ?? "var(--ink-faint)" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px]" style={{ color: "var(--ink)" }}>{row.requirement}</div>
                  <div className="font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>{row.area}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.service_ids.length > 0 ? row.service_ids.map((id) => (
                      <span key={id} className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                        style={{ background: "rgba(56,225,212,0.1)", color: "var(--cyan)", border: "1px solid var(--line)" }}>
                        {nameOf(id)}
                      </span>
                    )) : (
                      <span className="font-mono text-[9px]" style={{ color: "var(--rose)" }}>no owning service</span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[8px] uppercase" style={{ color: COV[row.coverage] }}>{row.coverage}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
