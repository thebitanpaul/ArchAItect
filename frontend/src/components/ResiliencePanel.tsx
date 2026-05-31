import { Zap, AlertOctagon } from "lucide-react";
import type { Resilience } from "@/types/architecture";

interface Props {
  resilience: Resilience;
  onBlastRadius: (sourceId: string, impacted: string[]) => void;
}

export default function ResiliencePanel({ resilience, onBlastRadius }: Props) {
  const score = resilience.resilience_score;
  const color = score >= 70 ? "var(--cyan)" : score >= 45 ? "var(--amber)" : "var(--rose)";

  return (
    <div className="panel panel-glow overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <Zap size={14} style={{ color }} />
        <div className="flex-1">
          <div className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
            RESILIENCE SIMULATOR
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Failure blast-radius analysis
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold" style={{ color }}>{score}</div>
          <div className="font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>/ 100</div>
        </div>
      </div>

      <div className="p-4">
        <p className="mb-3 text-[11px] leading-snug" style={{ color: "var(--ink-faint)" }}>
          Hover a service to simulate its failure — the map highlights everything that
          breaks downstream. (Async/event links contain failures; sync calls propagate it.)
        </p>

        {resilience.single_points_of_failure.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg p-2.5"
            style={{ background: "rgba(255,107,138,0.06)", border: "1px solid rgba(255,107,138,0.25)" }}>
            <AlertOctagon size={13} style={{ color: "var(--rose)", marginTop: 1 }} />
            <span className="text-[11px] leading-snug" style={{ color: "var(--ink-dim)" }}>
              <span style={{ color: "var(--rose)" }}>Single points of failure: </span>
              {resilience.single_points_of_failure
                .map((id) => resilience.per_service[id]?.name ?? id)
                .join(", ")}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          {resilience.ranking.map((s) => {
            const pct = resilience.total_services > 1
              ? s.impact_count / (resilience.total_services - 1) : 0;
            const barColor = pct >= 0.5 ? "var(--rose)" : pct >= 0.25 ? "var(--amber)" : "var(--cyan-dim)";
            return (
              <div
                key={s.id}
                onMouseEnter={() => onBlastRadius(s.id, s.impacts)}
                onMouseLeave={() => onBlastRadius("", [])}
                className="cursor-pointer rounded-md px-2.5 py-2 transition-colors"
                style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--ink)" }}>{s.name}</span>
                  <span className="font-mono text-[10px]" style={{ color: barColor }}>
                    {s.impact_count === 0 ? "isolated" : `breaks ${s.impact_count}`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(pct * 100, s.impact_count > 0 ? 8 : 0)}%`, background: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
