import { AnimatePresence, motion } from "framer-motion";
import type { Architecture, Service } from "@/types/architecture";

interface Props {
  arch: Architecture;
  service: Service | null;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function ServiceDrawer({ arch, service, onClose }: Props) {
  const related = service
    ? arch.edges.filter((e) => e.from === service.id || e.to === service.id)
    : [];

  return (
    <AnimatePresence>
      {service && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(5,8,15,0.55)", backdropFilter: "blur(2px)" }}
          />
          <motion.aside
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="panel fixed right-0 top-0 z-50 h-full w-[400px] overflow-y-auto p-6"
            style={{ borderRadius: 0, borderRight: "none", borderTop: "none", borderBottom: "none" }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] tracking-wider accent-cyan">
                  {service.bounded_context.toUpperCase()}
                </div>
                <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--ink)" }}>
                  {service.name}
                </h2>
              </div>
              <button onClick={onClose} className="tag" style={{ cursor: "pointer" }}>
                esc
              </button>
            </div>

            <Section title="RESPONSIBILITY">
              <p className="text-sm leading-relaxed" style={{ color: "var(--ink-dim)" }}>
                {service.responsibility}
              </p>
            </Section>

            <Section title="WHY ITS OWN SERVICE">
              <p className="text-sm leading-relaxed" style={{ color: "var(--ink-dim)" }}>
                {service.rationale}
              </p>
            </Section>

            <div className="grid grid-cols-2 gap-3">
              <Section title="DATA STORE">
                <span className="tag accent-amber">{service.data_store}</span>
              </Section>
              <Section title="OWNS">
                <div className="flex flex-wrap gap-1.5">
                  {service.owns_entities.map((e) => (
                    <span key={e} className="tag">{e}</span>
                  ))}
                </div>
              </Section>
            </div>

            <Section title="KEY APIS">
              <div className="space-y-1.5">
                {service.key_apis.map((api) => (
                  <div key={api} className="rounded-md px-3 py-2 font-mono text-xs"
                    style={{ background: "var(--bg)", border: "1px solid var(--line-soft)", color: "var(--ink-dim)" }}>
                    {api}
                  </div>
                ))}
              </div>
            </Section>

            {service.integrations && service.integrations.length > 0 && (
              <Section title="INTEGRATIONS & EXTERNAL SERVICES">
                <div className="flex flex-wrap gap-1.5">
                  {service.integrations.map((it) => (
                    <span key={it} className="tag">{it}</span>
                  ))}
                </div>
              </Section>
            )}

            <Section title={`DEPENDENCIES (${related.length})`}>
              <div className="space-y-2">
                {related.map((e, i) => {
                  const other = e.from === service.id ? e.to : e.from;
                  const dir = e.from === service.id ? "calls" : "called by";
                  const name = arch.services.find((s) => s.id === other)?.name ?? other;
                  return (
                    <div key={i} className="rounded-md p-2.5"
                      style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: "var(--ink)" }}>
                          <span style={{ color: "var(--ink-faint)" }}>{dir} </span>{name}
                        </span>
                        <span className="font-mono text-[9px]"
                          style={{ color: e.type === "async" ? "var(--violet)" : "var(--cyan)" }}>
                          {e.type} · {e.protocol}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--ink-faint)" }}>
                        {e.reason}
                      </p>
                    </div>
                  );
                })}
                {related.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>No direct dependencies.</p>
                )}
              </div>
            </Section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
