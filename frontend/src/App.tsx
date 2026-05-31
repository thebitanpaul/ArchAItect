import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download, ShieldAlert, Zap, GitBranch, Search, Pencil, Loader2, Info, ArrowDown, Gauge, GitMerge,
} from "lucide-react";
import {
  analyzeStream, fetchReview, fetchRoadmap, fetchCompetitor, fetchTraceability, recomputeArch, applyFix,
} from "@/lib/api";
import type { Architecture, Risk, Service, Edge, StepEvent } from "@/types/architecture";
import { PIPELINE_STEPS } from "@/types/architecture";
import Logo from "@/components/Logo";
import InputPanel from "@/components/InputPanel";
import PipelineConsole from "@/components/PipelineConsole";
import ServiceMap from "@/components/ServiceMap";
import ServiceDrawer from "@/components/ServiceDrawer";
import ServiceEditor from "@/components/ServiceEditor";
import CompetitorPanel from "@/components/CompetitorPanel";
import RiskAudit from "@/components/RiskAudit";
import ResiliencePanel from "@/components/ResiliencePanel";
import RoadmapPanel from "@/components/RoadmapPanel";
import MetricsPanel from "@/components/MetricsPanel";
import TraceabilityPanel from "@/components/TraceabilityPanel";
import ResultsSkeleton from "@/components/ResultsSkeleton";
import InfoDot from "@/components/InfoDot";

type StepStatus = "pending" | "running" | "done";
type BackendState = "checking" | "online" | "offline";
type Lens = "edit" | "resilience" | "metrics" | "review" | "roadmap" | "traceability" | "competitor";

function initialStatuses(): Record<string, StepStatus> {
  const o: Record<string, StepStatus> = {};
  PIPELINE_STEPS.forEach((s) => (o[s.key] = "pending"));
  return o;
}

const LENSES: { key: Lens; label: string; icon: typeof Zap; onDemand: boolean }[] = [
  { key: "edit", label: "Edit", icon: Pencil, onDemand: false },
  { key: "metrics", label: "Metrics", icon: Gauge, onDemand: false },
  { key: "resilience", label: "Resilience", icon: Zap, onDemand: false },
  { key: "review", label: "Risk Audit", icon: ShieldAlert, onDemand: true },
  { key: "traceability", label: "Traceability", icon: GitMerge, onDemand: true },
  { key: "roadmap", label: "Roadmap", icon: GitBranch, onDemand: true },
  { key: "competitor", label: "Competitor", icon: Search, onDemand: true },
];
const LENS_ORDER = LENSES.map((l) => l.key);

export default function App() {
  const [welcomed, setWelcomed] = useState(false);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [arch, setArch] = useState<Architecture | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendState>("checking");
  const [lens, setLens] = useState<Lens>("resilience");
  const [prevLensIdx, setPrevLensIdx] = useState(1);
  const [highlight, setHighlight] = useState<{ source: string; set: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // After the map is generated, smooth-scroll to the results so the input and
  // pipeline scroll out of view and the map takes the stage.
  useEffect(() => {
    if (arch && resultsRef.current) {
      const t = setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [arch]);

  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.VITE_API_BASE ?? "http://localhost:8000"}/api/health`)
      .then((r) => (r.ok ? setBackend("online") : setBackend("offline")))
      .catch(() => alive && setBackend("offline"));
    return () => { alive = false; };
  }, []);

  const selectedService = useMemo(
    () => arch?.services.find((s) => s.id === selectedId) ?? null,
    [arch, selectedId]
  );
  const onSelect = useCallback((id: string) => setSelectedId(id || null), []);

  const optionalStatuses = useMemo(() => {
    const s: Record<string, StepStatus> = { review: "pending", roadmap: "pending", competitor: "pending", traceability: "pending" };
    if (arch?.review) s.review = "done";
    if (arch?.roadmap) s.roadmap = "done";
    if (arch?.competitor) s.competitor = "done";
    if (arch?.traceability) s.traceability = "done";
    if (busy === "review") s.review = "running";
    if (busy === "roadmap") s.roadmap = "running";
    if (busy === "competitor") s.competitor = "running";
    if (busy === "traceability") s.traceability = "running";
    return s;
  }, [arch, busy]);

  function exportJson() {
    if (!arch) return;
    const blob = new Blob([JSON.stringify(arch, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(arch.app_type || "architecture").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run(doc: string) {
    setRunning(true); setError(null); setArch(null); setSelectedId(null);
    setHighlight(null); setChangeNote(null); setDirty(false); setLens("resilience");
    setStatuses(initialStatuses());
    try {
      const result = await analyzeStream(doc, (e: StepEvent) => {
        if (e.step === "result") return;
        setStatuses((prev) => {
          const next = { ...prev };
          if (e.status === "running") next[e.step] = "running";
          if (e.status === "done") next[e.step] = "done";
          return next;
        });
      });
      setArch(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  // Switch lens with directional slide. Does NOT auto-run analyses — the
  // section shows a token-cost prompt the user must confirm.
  function gotoLens(target: Lens) {
    setPrevLensIdx(LENS_ORDER.indexOf(lens));
    setLens(target);
    setHighlight(null);
  }

  // Explicitly trigger an on-demand analysis (only on user confirm).
  async function runAnalysis(which: "review" | "roadmap" | "competitor" | "traceability") {
    if (!arch || busy) return;
    setBusy(which);
    try {
      if (which === "review") {
        const review = await fetchReview(arch.services, arch.edges);
        setArch((p) => p ? { ...p, review } : p);
      } else if (which === "roadmap") {
        const roadmap = await fetchRoadmap(arch.services, arch.edges);
        setArch((p) => p ? { ...p, roadmap } : p);
      } else if (which === "traceability") {
        const traceability = await fetchTraceability(arch.functional_areas, arch.services);
        setArch((p) => p ? { ...p, traceability } : p);
      } else {
        const competitor = await fetchCompetitor(arch.services, arch.app_type);
        setArch((p) => p ? { ...p, competitor } : p);
      }
    } catch (e) { setError(e instanceof Error ? e.message : `${which} failed.`); }
    finally { setBusy(null); }
  }

  function onServicesChange(services: Service[]) {
    setArch((p) => p ? { ...p, services, review: undefined, roadmap: undefined, traceability: undefined } : p);
    setDirty(true); setChangeNote(null);
  }
  function onConnectNodes(from: string, to: string, type: "sync" | "async") {
    if (from === to) return;
    setArch((p) => {
      if (!p) return p;
      if (p.edges.some((e) => e.from === from && e.to === to)) return p;
      const protocol = type === "async" ? "Event/Message Queue" : "REST";
      const edge: Edge = { from, to, type, protocol, reason: "User-defined dependency." };
      return { ...p, edges: [...p.edges, edge], review: undefined, roadmap: undefined, traceability: undefined };
    });
    setDirty(true); setChangeNote(null);
  }
  function onCycleEdge(from: string, to: string) {
    setArch((p) => p ? {
      ...p,
      edges: p.edges.map((e) => e.from === from && e.to === to
        ? { ...e, type: e.type === "sync" ? "async" : "sync", protocol: e.type === "sync" ? "Event/Message Queue" : "REST" }
        : e),
      review: undefined, roadmap: undefined, traceability: undefined,
    } : p);
    setDirty(true); setChangeNote(null);
  }
  function onDeleteEdge(from: string, to: string) {
    setArch((p) => p ? {
      ...p, edges: p.edges.filter((e) => !(e.from === from && e.to === to)),
      review: undefined, roadmap: undefined, traceability: undefined,
    } : p);
    setDirty(true); setChangeNote(null);
  }

  async function reanalyze() {
    if (!arch) return;
    setBusy("recompute");
    try {
      const r = await recomputeArch(arch.services, arch.edges);
      setArch((p) => p ? { ...p, edges: r.edges, resilience: r.resilience, metrics: r.metrics } : p);
      setDirty(false);
      setChangeNote("Re-analyzed your edited design (resilience updated).");
    } catch (e) { setError(e instanceof Error ? e.message : "Re-analyze failed."); }
    finally { setBusy(null); }
  }

  async function onApplyFix(risk: Risk) {
    if (!arch || busy) return;
    setBusy("fix"); setChangeNote(null); setHighlight(null);
    const instruction = `${risk.recommendation} (addressing the "${risk.title}" tradeoff affecting ${risk.affected_services.join(", ")})`;
    try {
      const r = await applyFix(arch.services, instruction);
      setArch((p) => p ? {
        ...p, services: r.services, edges: r.edges, resilience: r.resilience, metrics: r.metrics,
        review: undefined, traceability: undefined,
      } : p);
      setChangeNote(r.change_note || "Applied tradeoff.");
      gotoLens("resilience");
    } catch (e) { setError(e instanceof Error ? e.message : "Apply fix failed."); }
    finally { setBusy(null); }
  }

  const slideDir = LENS_ORDER.indexOf(lens) >= prevLensIdx ? 1 : -1;

  return (
    <div ref={appRef} className="min-h-screen">
      {/* ---------- WELCOME ---------- */}
      <AnimatePresence>
        {!welcomed && (
          <motion.section
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: "var(--bg)" }}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }} className="flex flex-col items-center text-center">
              <Logo size={84} />
              <h1 className="mt-6 font-mono text-5xl font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
                Arch<span className="accent-amber">AI</span>tect
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed" style={{ color: "var(--ink-dim)" }}>
                Turn dense requirements into a clear microservice architecture — with an AI risk
                audit, a failure-resilience simulator, a migration roadmap, and live competitor intel.
              </p>
              <motion.button
                onClick={() => setWelcomed(true)}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                className="mt-8 flex items-center gap-2 rounded-xl px-7 py-3 text-base font-semibold"
                style={{ background: "var(--amber)", color: "#1a1205", boxShadow: "0 0 40px -8px var(--glow-amber)" }}
              >
                Let's go <ArrowDown size={18} />
              </motion.button>
              <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}
                className="mt-10 font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                scroll to begin
              </motion.div>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ---------- HEADER ---------- */}
      <header className="glass sticky top-0 z-30 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-6 py-3.5">
          <Logo size={38} />
          <div>
            <h1 className="font-mono text-lg font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
              Arch<span className="accent-amber">AI</span>tect
            </h1>
            <p className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
              Shape your business with AI
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ border: "1px solid var(--line)", background: "rgba(255,255,255,0.015)" }}>
              <span className={backend === "online" ? "pulse" : ""}
                style={{ width: 7, height: 7, borderRadius: 99,
                  background: backend === "online" ? "var(--cyan)" : backend === "offline" ? "var(--rose)" : "var(--amber)",
                  boxShadow: backend === "online" ? "0 0 8px var(--cyan)" : "none" }} />
              <span className="font-mono text-[10px]" style={{ color: "var(--ink-dim)" }}>
                {backend === "online" ? "engine online" : backend === "offline" ? "engine offline" : "connecting…"}
              </span>
            </div>
            <button onClick={exportJson} disabled={!arch}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px] transition-colors"
              style={{ border: "1px solid var(--line)", color: arch ? "var(--cyan)" : "var(--ink-faint)",
                cursor: arch ? "pointer" : "not-allowed", background: "rgba(255,255,255,0.015)" }}>
              <Download size={12} /> export json
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
          <InputPanel onRun={run} running={running} />
          <PipelineConsole statuses={statuses} optionalStatuses={optionalStatuses} active={running} />
        </div>

        {error && (
          <div className="panel mt-5 flex items-center justify-between p-4" style={{ borderColor: "var(--rose)" }}>
            <span className="font-mono text-xs" style={{ color: "var(--rose)" }}>error: {error}</span>
            <button onClick={() => setError(null)} className="font-mono text-[10px]" style={{ color: "var(--ink-faint)", cursor: "pointer" }}>dismiss</button>
          </div>
        )}

        {running && !arch && <ResultsSkeleton />}

        {!arch && !running && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="panel mt-5 flex h-[360px] flex-col items-center justify-center">
            <div className="font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
              <span className="cursor-blink">awaiting requirements</span>
            </div>
            <p className="mt-2 max-w-md text-center text-xs" style={{ color: "var(--ink-faint)" }}>
              Paste a spec or load the sample. You'll get a service map you can edit — then run a
              risk audit, resilience simulation, roadmap, or competitor scan on demand.
            </p>
          </motion.div>
        )}

        {arch && (
          <motion.div ref={resultsRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5" style={{ scrollMarginTop: 76 }}>
            {/* Summary strip */}
            <div className="panel panel-hover mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
              <div>
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>DOMAIN</span>
                <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{arch.app_type}</div>
              </div>
              <div className="h-8 w-px" style={{ background: "var(--line)" }} />
              <div className="flex gap-5">
                <Stat n={arch.services.length} label="services" />
                <Stat n={arch.edges.length} label="dependencies" />
                {arch.resilience && <Stat n={arch.resilience.resilience_score} label="resilience" accent="var(--cyan)" />}
                {arch.review?.score != null && <Stat n={arch.review.score} label="health" accent="var(--amber)" />}
              </div>
              {arch.preprocess?.compressed && (
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
                  style={{ background: "rgba(56,225,212,0.06)", border: "1px solid var(--line)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--cyan)" }} />
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-dim)" }}>
                    doc compressed{" "}
                    <span className="accent-cyan">
                      {Math.round((1 - arch.preprocess.digest_chars / arch.preprocess.original_chars) * 100)}%
                    </span>{" "}before LLM
                  </span>
                </div>
              )}
            </div>

            {/* Lens navigation — inline, below summary, above the map */}
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <span className="ml-1 mr-1 font-mono text-[9px] tracking-wider" style={{ color: "var(--ink-faint)" }}>LENS</span>
              {LENSES.map((l) => {
                const Icon = l.icon;
                const active = lens === l.key;
                const done = l.onDemand && (
                  (l.key === "review" && arch.review) || (l.key === "roadmap" && arch.roadmap) ||
                  (l.key === "competitor" && arch.competitor) || (l.key === "traceability" && arch.traceability)
                );
                return (
                  <motion.button key={l.key} onClick={() => gotoLens(l.key)}
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}
                    className="relative flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-[11px] transition-colors"
                    style={{
                      background: active ? "rgba(56,225,212,0.14)" : "transparent",
                      border: `1px solid ${active ? "var(--cyan)" : "var(--line)"}`,
                      color: active ? "var(--cyan)" : "var(--ink-dim)",
                      cursor: "pointer",
                    }}>
                    <Icon size={14} /> {l.label}
                    {l.onDemand && (
                      <span className="h-1.5 w-1.5 rounded-full"
                        style={{ background: done ? "var(--cyan)" : "var(--amber)" }}
                        title={done ? "generated" : "on demand — uses tokens"} />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Map (left, constant) + full-height section (right, swipes) */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]" style={{ minHeight: 600 }}>
              <ServiceMap arch={arch} selectedId={selectedId} onSelect={onSelect} highlight={highlight}
                editMode={lens === "edit"}
                onConnect={onConnectNodes} onDeleteEdge={onDeleteEdge} onCycleEdge={onCycleEdge} />

              <div className="relative overflow-hidden" style={{ height: 600 }}>
                <AnimatePresence mode="wait" custom={slideDir}>
                  <motion.div
                    key={lens}
                    custom={slideDir}
                    variants={{
                      enter: (d: number) => ({ opacity: 0, x: d * 60 }),
                      center: { opacity: 1, x: 0 },
                      exit: (d: number) => ({ opacity: 0, x: d * -60 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.32, ease: "easeOut" }}
                    className="h-full overflow-y-auto"
                  >
                    {busy && lens === busy ? (
                      <LoadingCard label={busy} />
                    ) : (
                      <>
                        {lens === "edit" && (
                          <ServiceEditor services={arch.services} onChange={onServicesChange} busy={!!busy} />
                        )}
                        {lens === "resilience" && arch.resilience && (
                          <ResiliencePanel resilience={arch.resilience}
                            onBlastRadius={(src, set) => setHighlight(src || set.length ? { source: src, set } : null)} />
                        )}
                        {lens === "metrics" && arch.metrics && (
                          <MetricsPanel metrics={arch.metrics} />
                        )}
                        {lens === "review" && (
                          arch.review ? (
                            <RiskAudit review={arch.review}
                              onHighlight={(ids) => setHighlight(ids.length ? { source: "", set: ids } : null)}
                              onFix={onApplyFix} refining={busy === "fix"} />
                          ) : <TokenPrompt title="AI Risk Audit"
                                desc="Audits your architecture for tradeoffs (sync SPOFs, chatty chains, God services) and scores it. Uses the AI engine."
                                cta="Run Risk Audit" onClick={() => runAnalysis("review")} />
                        )}
                        {lens === "traceability" && (
                          arch.traceability ? <TraceabilityPanel data={arch.traceability} services={arch.services} />
                            : <TokenPrompt title="Traceability Matrix"
                                desc="Maps every requirement from your document to the service(s) that satisfy it — proving coverage and finding gaps. Uses one AI call."
                                cta="Build Traceability Matrix" onClick={() => runAnalysis("traceability")} />
                        )}
                        {lens === "roadmap" && (
                          arch.roadmap ? <RoadmapPanel roadmap={arch.roadmap} services={arch.services} />
                            : <TokenPrompt title="Migration Roadmap"
                                desc="Generates a phased strangler-fig delivery plan ordered by your dependency graph. Uses the AI engine."
                                cta="Generate Roadmap" onClick={() => runAnalysis("roadmap")} />
                        )}
                        {lens === "competitor" && (
                          arch.competitor ? <CompetitorPanel data={arch.competitor} />
                            : <TokenPrompt title="Competitor Intelligence"
                                desc="Searches the live web for how a real company in this domain is architected. Uses the AI engine + web search."
                                cta="Scan Competitor" onClick={() => runAnalysis("competitor")} />
                        )}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {changeNote && (
                <motion.div key="note" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="panel mt-5 flex items-center gap-2 overflow-hidden px-4 py-2.5" style={{ borderColor: "var(--cyan)" }}>
                  <span className="font-mono text-[10px] accent-cyan">UPDATED</span>
                  <span className="text-xs" style={{ color: "var(--ink-dim)" }}>{changeNote}</span>
                </motion.div>
              )}
              {dirty && (
                <motion.div key="dirty" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="panel mt-5 flex items-center gap-3 overflow-hidden px-4 py-2.5" style={{ borderColor: "var(--amber)" }}>
                  <span className="font-mono text-[10px]" style={{ color: "var(--amber)" }}>UNSAVED EDITS</span>
                  <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
                    You changed the services. Re-analyze to update dependencies & resilience (free).
                  </span>
                  <button onClick={reanalyze} disabled={busy === "recompute"}
                    className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[10px]"
                    style={{ background: "var(--amber)", color: "#1a1205", cursor: "pointer" }}>
                    {busy === "recompute" ? <Loader2 size={11} className="animate-spin" /> : null}
                    re-analyze
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="panel mt-5 px-5 py-4">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
                  CROSS-CUTTING CONCERNS · PLATFORM ESSENTIALS
                </span>
                <InfoDot align="left" content={{
                  summary: "Capabilities every service relies on but none owns alone — listed so the architecture accounts for them up front:",
                  bullets: [
                    { term: "API Gateway", desc: "a single front door that routes each request to the right service" },
                    { term: "Auth", desc: "who can log in and what they're allowed to do" },
                    { term: "Observability", desc: "logging, metrics, and tracing to monitor the system" },
                  ],
                }} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {arch.shared_concerns.map((c) => <span key={c} className="tag">{c}</span>)}
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* ---------- COPYRIGHT FOOTER ---------- */}
      <footer className="border-t py-5 text-center" style={{ borderColor: "var(--line)" }}>
        <span className="font-mono text-[11px]" style={{ color: "var(--ink-faint)" }}>
          2026 | © phiUture | All Rights Reserved
        </span>
      </footer>

      <ServiceDrawer arch={arch ?? ({} as Architecture)} service={selectedService} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function Stat({ n, label, accent = "var(--cyan)" }: { n: number; label: string; accent?: string }) {
  return (
    <div>
      <span className="font-mono text-lg font-bold" style={{ color: accent }}>{n}</span>
      <span className="ml-1.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>{label}</span>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="panel flex h-full min-h-[260px] flex-col items-center justify-center gap-3">
      <Loader2 size={22} className="animate-spin" style={{ color: "var(--cyan)" }} />
      <span className="font-mono text-[11px]" style={{ color: "var(--ink-faint)" }}>running {label} analysis…</span>
    </div>
  );
}

function TokenPrompt({ title, desc, cta, onClick }: { title: string; desc: string; cta: string; onClick: () => void }) {
  return (
    <div className="panel panel-glow flex h-full min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex items-center gap-2">
        <Info size={15} style={{ color: "var(--amber)" }} />
        <span className="font-mono text-[11px] tracking-wider" style={{ color: "var(--amber)" }}>ON-DEMAND · USES TOKENS</span>
      </div>
      <div className="text-base font-semibold" style={{ color: "var(--ink)" }}>{title}</div>
      <p className="max-w-[300px] text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>{desc}</p>
      <motion.button onClick={onClick} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
        className="rounded-lg px-5 py-2.5 text-sm font-semibold"
        style={{ background: "var(--amber)", color: "#1a1205", boxShadow: "0 0 24px -6px var(--glow-amber)" }}>
        {cta}
      </motion.button>
      <span className="font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>nothing runs until you click</span>
    </div>
  );
}
