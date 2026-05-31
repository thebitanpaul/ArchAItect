import { motion } from "framer-motion";
import { GitBranch, Flag } from "lucide-react";
import type { Roadmap, Service } from "@/types/architecture";

interface Props {
  roadmap: Roadmap;
  services: Service[];
}

export default function RoadmapPanel({ roadmap, services }: Props) {
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="panel panel-glow overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <GitBranch size={14} style={{ color: "var(--violet)" }} />
        <div>
          <div className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
            MIGRATION ROADMAP
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Phased delivery plan
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="mb-4 text-xs leading-snug" style={{ color: "var(--ink-dim)" }}>
          {roadmap.approach}
        </p>

        <div className="space-y-3">
          {roadmap.phases.map((p, i) => (
            <motion.div
              key={p.phase}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex gap-3"
            >
              {/* number column (flex, never overlaps) */}
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--violet)", color: "var(--violet)" }}>
                  {p.phase}
                </span>
                {i < roadmap.phases.length - 1 && (
                  <span className="mt-1 w-px flex-1" style={{ background: "var(--line)", minHeight: 24 }} />
                )}
              </div>
              {/* content column */}
              <div className="flex-1 pb-1">
                <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{p.name}</div>
                <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--ink-dim)" }}>{p.goal}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.services.map((sid) => (
                    <span key={sid} className="tag" style={{ fontSize: 10 }}>{nameOf(sid)}</span>
                  ))}
                </div>
                <div className="mt-2 flex items-start gap-1.5">
                  <Flag size={11} style={{ color: "var(--cyan)", marginTop: 2 }} />
                  <span className="text-[11px] leading-snug" style={{ color: "var(--ink-faint)" }}>
                    <span className="accent-cyan">milestone: </span>{p.milestone}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
