import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, X } from "lucide-react";
import { FREE_PROVIDER, hintAlreadySeen, markHintSeen, useEngine } from "@/lib/llm";

export type BackendState = "checking" | "online" | "offline";

interface Props {
  backend: BackendState;
  /** Start the first-visit nudge — false while the welcome overlay covers the header. */
  armHint: boolean;
  onOpen: () => void;
}

/** How long the first-visit nudge stays up before dismissing itself. */
const HINT_MS = 10_000;

/**
 * The header's engine status pill. Reads as a live indicator, behaves as a button:
 * clicking it opens engine settings, which is where BYO keys are configured.
 *
 * On a visitor's first arrival it points at itself once with a self-dismissing
 * callout, because "the status chip is also the settings entry point" isn't
 * something anyone would guess.
 */
export default function EnginePill({ backend, armHint, onOpen }: Props) {
  const engine = useEngine();
  // Snapshotted once at mount: `markHintSeen()` writes to localStorage below, and
  // re-reading it during render would make the callout vanish on the next paint.
  const [firstVisit] = useState(() => !hintAlreadySeen());
  const [dismissed, setDismissed] = useState(false);
  const [expired, setExpired] = useState(false);

  const ownKey = engine.provider !== FREE_PROVIDER && !!engine.secret?.apiKey;
  const providerLabel =
    engine.providers.find((p) => p.id === engine.provider)?.label ?? engine.provider;
  const freeBusy = backend === "online" && !ownKey && engine.freeTier?.available === false;

  const eligible = firstVisit && armHint && engine.ready;
  const showHint = eligible && !dismissed && !expired;

  useEffect(() => {
    if (!eligible) return;
    markHintSeen();
    const t = setTimeout(() => setExpired(true), HINT_MS);
    return () => clearTimeout(t);
  }, [eligible]);

  const { dot, label, tone } = (() => {
    if (backend === "checking") return { dot: "var(--amber)", label: "connecting…", tone: "var(--ink-dim)" };
    if (backend === "offline") return { dot: "var(--rose)", label: "engine offline", tone: "var(--ink-dim)" };
    if (ownKey) return { dot: "var(--cyan)", label: `your ${providerLabel.toLowerCase()} key`, tone: "var(--cyan)" };
    if (freeBusy) return { dot: "var(--amber)", label: "free engine busy", tone: "var(--amber)" };
    return { dot: "var(--cyan)", label: "engine online · free", tone: "var(--ink-dim)" };
  })();

  const live = backend === "online";

  return (
    <div className="relative">
      <motion.button
        onClick={() => { setDismissed(true); onOpen(); }}
        whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
        title="Engine settings — use your own LLM API key"
        aria-label="Engine settings"
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors"
        style={{
          border: `1px solid ${freeBusy ? "var(--amber)" : "var(--line)"}`,
          background: "rgba(255,255,255,0.015)",
          cursor: "pointer",
        }}
      >
        <span className={live && !freeBusy ? "pulse" : ""}
          style={{
            width: 7, height: 7, borderRadius: 99, background: dot,
            boxShadow: live && !freeBusy ? `0 0 8px ${dot}` : "none",
          }} />
        <span className="font-mono text-[10px]" style={{ color: tone }}>{label}</span>
        <KeyRound size={10} style={{ color: "var(--ink-faint)" }} />
      </motion.button>

      <AnimatePresence>
        {showHint && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="panel panel-glow absolute right-0 top-full z-50 mt-2.5 w-[228px] px-3.5 py-3"
            style={{ borderColor: "var(--amber)" }}
          >
            {/* little arrow pointing back up at the pill */}
            <span className="absolute -top-[5px] right-6 h-2 w-2 rotate-45"
              style={{
                background: "var(--panel)",
                borderTop: "1px solid var(--amber)",
                borderLeft: "1px solid var(--amber)",
              }} />
            <button onClick={() => setDismissed(true)} aria-label="Dismiss"
              className="absolute right-1.5 top-1.5 rounded p-1"
              style={{ color: "var(--ink-faint)", cursor: "pointer" }}>
              <X size={11} />
            </button>
            <button onClick={() => { setDismissed(true); onOpen(); }}
              className="block pr-4 text-left" style={{ cursor: "pointer" }}>
              <span className="font-mono text-[9px] tracking-wider" style={{ color: "var(--amber)" }}>
                BRING YOUR OWN KEY
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
                Click here to add your own key — Gemini, Claude, GPT, Bedrock and more.
                It stays encrypted in your browser.
              </span>
            </button>
            {/* 10s countdown bar, so the auto-dismiss doesn't feel like a glitch */}
            <motion.span
              initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}
              transition={{ duration: HINT_MS / 1000, ease: "linear" }}
              className="absolute bottom-0 left-0 h-[2px] w-full origin-left"
              style={{ background: "var(--amber)", opacity: 0.5, borderRadius: 99 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
