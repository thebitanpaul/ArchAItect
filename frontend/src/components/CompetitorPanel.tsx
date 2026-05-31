import { motion } from "framer-motion";
import type { Competitor } from "@/types/architecture";

export default function CompetitorPanel({ data }: { data: Competitor }) {
  if (!data || data.competitor === "Unavailable") {
    return (
      <div className="panel p-5">
        <div className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
          Competitor intel unavailable for this run.
        </div>
      </div>
    );
  }

  // Defensive: the agent may omit these arrays; never call .map on undefined.
  const knownServices = Array.isArray(data.known_services) ? data.known_services : [];
  const insights = Array.isArray(data.insights) ? data.insights : [];

  return (
    <div className="panel panel-glow overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: "rgba(255,179,71,0.1)", border: "1px solid var(--amber)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <div>
          <div className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
            COMPETITOR INTELLIGENCE · LIVE WEB
          </div>
          <div className="text-base font-bold" style={{ color: "var(--ink)" }}>
            How {data.competitor} builds this
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
          {data.why_relevant}
        </p>

        <div className="mb-2 font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
          THEIR KNOWN SERVICES
        </div>
        <div className="mb-5 space-y-2">
          {knownServices.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-lg p-3"
              style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.name}</span>
              </div>
              <p className="mt-1 pl-3.5 text-[11.5px] leading-snug" style={{ color: "var(--ink-dim)" }}>
                {s.purpose}
              </p>
              <p className="mt-1 pl-3.5 font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                src: {s.source_hint}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mb-2 font-mono text-[10px] tracking-wider accent-cyan">
          TAKEAWAYS FOR YOUR DESIGN
        </div>
        <ul className="space-y-1.5">
          {insights.map((ins, i) => (
            <li key={i} className="flex gap-2 text-xs leading-snug" style={{ color: "var(--ink-dim)" }}>
              <span className="accent-cyan">→</span>
              <span>{ins}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
