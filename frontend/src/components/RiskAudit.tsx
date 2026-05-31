import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Wrench } from "lucide-react";
import type { Review, Risk } from "@/types/architecture";

const SEV_COLOR: Record<string, string> = {
  high: "var(--rose)",
  medium: "var(--amber)",
  low: "var(--cyan)",
};

function ScoreGauge({ score, grade }: { score: number | null; grade: string }) {
  const pct = score ?? 0;
  const color = pct >= 80 ? "var(--cyan)" : pct >= 60 ? "var(--amber)" : "var(--rose)";
  const circ = 2 * Math.PI * 26;
  return (
    <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r="26" fill="none" stroke="var(--line)" strokeWidth="5" />
        <motion.circle
          cx="36" cy="36" r="26" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-mono font-bold" style={{ color, fontSize: 18, lineHeight: 1 }}>
          {score ?? "—"}
        </span>
        <span className="font-mono" style={{ color: "var(--ink-faint)", fontSize: 7, marginTop: 2 }}>
          {grade}
        </span>
      </div>
    </div>
  );
}

interface Props {
  review: Review;
  onHighlight: (serviceIds: string[]) => void;
  onFix: (risk: Risk) => void;
  refining: boolean;
}

export default function RiskAudit({ review, onHighlight, onFix, refining }: Props) {
  return (
    <div className="panel panel-glow overflow-hidden">
      <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <ScoreGauge score={review.score} grade={review.grade} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} style={{ color: "var(--amber)" }} />
            <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
              AI ARCHITECTURE REVIEW
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug" style={{ color: "var(--ink-dim)" }}>
            {review.summary}
          </p>
        </div>
      </div>

      <div className="p-4">
        {review.risks.length > 0 ? (
          <div className="space-y-2.5">
            {review.risks.map((risk, i) => {
              const c = SEV_COLOR[risk.severity] ?? "var(--ink-faint)";
              return (
                <motion.div
                  key={risk.id || i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onMouseEnter={() => onHighlight(risk.affected_services)}
                  onMouseLeave={() => onHighlight([])}
                  className="rounded-lg p-3 transition-colors"
                  style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                      style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}>
                      {risk.severity}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: "var(--ink-faint)" }}>
                      {risk.category}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {risk.title}
                  </div>
                  <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--ink-dim)" }}>
                    {risk.explanation}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 text-[11px] leading-snug" style={{ color: "var(--ink-faint)" }}>
                      <span className="accent-cyan">fix → </span>{risk.recommendation}
                    </span>
                    <button
                      onClick={() => onFix(risk)}
                      disabled={refining}
                      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-colors"
                      style={{
                        border: `1px solid ${c}55`, color: c,
                        cursor: refining ? "wait" : "pointer",
                        background: `${c}11`,
                      }}
                    >
                      <Wrench size={10} /> apply fix
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-3" style={{ color: "var(--cyan)" }}>
            <ShieldCheck size={16} />
            <span className="text-sm">No significant risks flagged — solid design.</span>
          </div>
        )}

        {review.strengths.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 font-mono text-[10px] tracking-wider accent-cyan">STRENGTHS</div>
            <ul className="space-y-1">
              {review.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-[11.5px]" style={{ color: "var(--ink-dim)" }}>
                  <span className="accent-cyan">✓</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
