import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Lock, Sparkles,
  X, XCircle, Zap,
} from "lucide-react";
import {
  FREE_PROVIDER, buildPayload, saveOwnKey, switchToFreeEngine, testKey, useEngine,
  type LlmPayload, type ProviderInfo, type TestResult,
} from "@/lib/llm";
import { canPersist } from "@/lib/keyvault";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Mode = "free" | "own";

/**
 * "Engine" settings — pick the shared free phiUture key or bring your own.
 *
 * The whole point of the dialog is that a user can prove a key works *before*
 * committing it, so Test is a first-class action and Save only lights up once the
 * required fields are filled. Nothing leaves the browser until the user asks.
 *
 * The form lives in a child that only exists while the dialog is open: mounting it
 * fresh is what syncs it to the live engine state, with no effect doing the copying.
 */
export default function EngineSettings({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[60]"
            style={{ background: "rgba(5,8,15,0.68)", backdropFilter: "blur(3px)" }}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Engine settings"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="panel panel-glow fixed left-1/2 top-1/2 z-[61] w-[min(560px,calc(100vw-2rem))]
                       max-h-[calc(100vh-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6"
          >
            <EngineForm onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EngineForm({ onClose }: { onClose: () => void }) {
  const engine = useEngine();

  // Initialised from the engine state at mount — see the note on EngineSettings.
  const [mode, setMode] = useState<Mode>(engine.provider === FREE_PROVIDER ? "free" : "own");
  const [providerId, setProviderId] = useState(
    engine.provider === FREE_PROVIDER ? "google" : engine.provider
  );
  const [model, setModel] = useState(engine.model);
  const [region, setRegion] = useState(engine.region);
  const [baseUrl, setBaseUrl] = useState(engine.baseUrl);
  // The saved key is deliberately never prefilled — we say one exists instead of
  // putting a secret back into the DOM where a screenshot or extension can read it.
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [remember, setRemember] = useState(engine.remember);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const provider: ProviderInfo | null = useMemo(
    () => engine.providers.find((p) => p.id === providerId) ?? null,
    [engine.providers, providerId]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function clearFeedback() {
    setResult(null);
    setSaved(null);
  }

  // Switching provider invalidates everything picked for the previous one — a
  // half-entered Anthropic key must not be submitted to Bedrock.
  function pickProvider(id: string) {
    setProviderId(id);
    setModel("");
    setApiKey("");
    setApiSecret("");
    clearFeedback();
    setRegion(engine.providers.find((p) => p.id === id)?.default_region ?? "");
    keyInputRef.current?.focus();
  }

  const hasExistingKey = !!engine.secret?.apiKey && engine.provider === providerId;
  /** Reuse the stored key when the user only wants to change the model. */
  const effectiveKey = apiKey.trim() || (hasExistingKey ? engine.secret!.apiKey : "");
  const effectiveSecret =
    apiSecret.trim() || (hasExistingKey ? engine.secret?.apiSecret ?? "" : "");

  const needsSecret = !!provider?.needs_secret;
  const complete =
    !!provider && !!effectiveKey && (!needsSecret || !!effectiveSecret) &&
    (!provider.needs_region || !!region.trim()) &&
    (provider.id !== "custom" || !!baseUrl.trim());

  function payload(): LlmPayload {
    return buildPayload(
      { provider: providerId, model, region, baseUrl },
      { apiKey: effectiveKey, apiSecret: effectiveSecret || undefined }
    );
  }

  async function onTest() {
    if (!complete || testing) return;
    setTesting(true);
    clearFeedback();
    setResult(await testKey(payload()));
    setTesting(false);
  }

  async function onSave() {
    if (mode === "free") {
      await switchToFreeEngine();
      setSaved("Switched to the free phiUture engine.");
      setTimeout(onClose, 700);
      return;
    }
    if (!complete) return;
    const persisted = await saveOwnKey(
      {
        provider: providerId, model: model.trim(), region: region.trim(),
        baseUrl: baseUrl.trim(), remember,
      },
      { apiKey: effectiveKey, apiSecret: effectiveSecret || undefined }
    );
    setSaved(
      persisted
        ? `Saved. ${provider?.label} will power every analysis from now on.`
        : remember
          ? "Saved for this tab only — this browser wouldn't allow encrypted storage."
          : `Saved for this tab. ${provider?.label} is active until you close it.`
    );
    setTimeout(onClose, 1100);
  }

  async function onRemove() {
    await switchToFreeEngine();
    setSaved("Key removed from this browser. Back on the free engine.");
    setTimeout(onClose, 900);
  }

  const free = engine.freeTier;
  const canSave = mode === "free" || complete;

  return (
    <>
      {/* ---- header ---- */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={14} style={{ color: "var(--amber)" }} />
            <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--amber)" }}>
              AI ENGINE
            </span>
          </div>
          <h2 className="mt-1.5 text-lg font-bold" style={{ color: "var(--ink)" }}>
            Bring your own key
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
            Run ArchAItect on your own LLM account — no shared queue, no limits but yours.
          </p>
        </div>
        <button onClick={onClose} aria-label="Close"
          className="rounded-lg p-1.5 transition-colors"
          style={{ border: "1px solid var(--line)", color: "var(--ink-faint)", cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>

      {/* ---- mode toggle ---- */}
      <div className="mb-5 grid grid-cols-2 gap-2">
        <ModeCard
          active={mode === "free"} onClick={() => { setMode("free"); clearFeedback(); }}
          icon={Sparkles} title="phiUture free"
          sub={free?.configured === false
            ? "not configured"
            : free?.available ? "shared key · available" : "shared key · busy"}
          tone={free?.available ? "cyan" : "amber"}
        />
        <ModeCard
          active={mode === "own"} onClick={() => { setMode("own"); clearFeedback(); }}
          icon={KeyRound} title="Your own key"
          sub="any provider · unlimited" tone="cyan"
        />
      </div>

      {/* ---- free tier detail ---- */}
      {mode === "free" && (
        <div className="rounded-xl p-4"
          style={{ border: "1px solid var(--line)", background: "rgba(56,225,212,0.04)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
            Uses a shared phiUture key so you can try everything without signing up
            anywhere. Because it's shared, <strong style={{ color: "var(--ink)" }}>availability
            depends on live traffic</strong> — when it's saturated you'll be asked to add
            your own key, which takes about a minute.
          </p>
          {free && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color: "var(--ink-dim)" }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 99,
                  background: free.available ? "var(--cyan)" : "var(--amber)",
                }} />
                {free.available ? "available now" : (free.reason ?? "busy").replace(/_/g, " ")}
              </span>
              {free.configured && (
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  {free.remaining} call{free.remaining === 1 ? "" : "s"} left for you this hour
                </span>
              )}
              {!free.available && free.resets_in_seconds > 0 && (
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  resets in {Math.ceil(free.resets_in_seconds / 60)} min
                </span>
              )}
            </div>
          )}
          {free && !free.available && (
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--amber)" }}>
              {free.message}
            </p>
          )}
        </div>
      )}

      {/* ---- own key form ---- */}
      {mode === "own" && (
        <div className="flex flex-col gap-4">
          <Field label="Provider">
            <div className="flex items-center gap-2">
              <select
                value={providerId} onChange={(e) => pickProvider(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={{ border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}
              >
                {engine.providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {provider?.key_url && (
                <a href={provider.key_url} target="_blank" rel="noreferrer noopener"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[10px] transition-colors"
                  style={{ border: "1px solid var(--amber)", color: "var(--amber)" }}>
                  get a key <ExternalLink size={11} />
                </a>
              )}
            </div>
            {provider?.note && (
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
                {provider.note}
              </p>
            )}
          </Field>

          <Field label="Model" hint="optional — blank uses the recommended default">
            {/* A datalist gives the suggestions of a dropdown while still accepting any
                model ID the account can reach; vendor IDs churn constantly. */}
            <input
              list={`models-${providerId}`} value={model}
              onChange={(e) => { setModel(e.target.value); clearFeedback(); }}
              placeholder={provider?.default_model || "model id"}
              spellCheck={false} autoComplete="off"
              className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
              style={{ border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}
            />
            <datalist id={`models-${providerId}`}>
              {(provider?.models ?? []).map((m) => <option key={m} value={m} />)}
            </datalist>
          </Field>

          <Field label={provider?.key_label ?? "API key"}>
            <div className="flex items-center gap-2">
              <input
                ref={keyInputRef} type={reveal ? "text" : "password"} value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); clearFeedback(); }}
                placeholder={hasExistingKey ? "•••••• saved — type to replace" : (provider?.key_hint || "paste your key")}
                spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
                // Stops password managers offering to save a provider API key as a
                // website login for archaitect.
                data-1p-ignore data-lpignore="true" name="archaitect-provider-key"
                className="flex-1 rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={{ border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}
              />
              <button type="button" onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "Hide key" : "Show key"}
                className="rounded-lg p-2"
                style={{ border: "1px solid var(--line)", color: "var(--ink-faint)", cursor: "pointer" }}>
                {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </Field>

          {needsSecret && (
            <Field label="Secret access key">
              <input
                type="password" value={apiSecret}
                onChange={(e) => { setApiSecret(e.target.value); clearFeedback(); }}
                placeholder={hasExistingKey && engine.secret?.apiSecret
                  ? "•••••• saved — type to replace" : "AWS secret access key"}
                spellCheck={false} autoComplete="off"
                data-1p-ignore data-lpignore="true" name="archaitect-provider-secret"
                className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={{ border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}
              />
            </Field>
          )}

          {provider?.needs_region && (
            <Field label="Region">
              <input
                value={region} onChange={(e) => { setRegion(e.target.value); clearFeedback(); }}
                placeholder={provider.default_region ?? "us-east-1"}
                spellCheck={false} autoComplete="off"
                className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={{ border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}
              />
            </Field>
          )}

          {providerId === "custom" && (
            <Field label="Base URL" hint="OpenAI-compatible /chat/completions endpoint">
              <input
                value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); clearFeedback(); }}
                placeholder="http://localhost:11434/v1"
                spellCheck={false} autoComplete="off"
                className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={{ border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}
              />
            </Field>
          )}

          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 accent-[color:var(--cyan)]" style={{ cursor: "pointer" }} />
            <span className="text-[11px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
              Remember on this device — stored encrypted so you don't re-paste it.
              {!canPersist() && (
                <span style={{ color: "var(--amber)" }}> This browser blocks encrypted
                  storage, so the key will only last for this tab.</span>
              )}
              <br />
              <span style={{ color: "var(--ink-faint)" }}>
                Uncheck to keep it in memory for this tab only.
              </span>
            </span>
          </label>

          {/* ---- security note ---- */}
          <div className="flex items-start gap-2.5 rounded-xl p-3.5"
            style={{ border: "1px solid var(--line)", background: "rgba(56,225,212,0.04)" }}>
            <Lock size={13} className="mt-0.5 shrink-0" style={{ color: "var(--cyan)" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
              Your key is encrypted with AES-256-GCM before it's stored, using a WebCrypto
              key that <strong style={{ color: "var(--ink)" }}>cannot be read back out of
              your browser</strong> — not even by this app. It travels only over HTTPS, is
              used for your request, and is never written to our logs, database, or disk.
              Remove it any time from this dialog.
            </p>
          </div>
        </div>
      )}

      {/* ---- feedback ---- */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result.ok ? "ok" : "fail"}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 flex items-start gap-2 overflow-hidden rounded-lg px-3 py-2.5"
            style={{ border: `1px solid ${result.ok ? "var(--cyan)" : "var(--rose)"}` }}>
            {result.ok
              ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: "var(--cyan)" }} />
              : <XCircle size={13} className="mt-0.5 shrink-0" style={{ color: "var(--rose)" }} />}
            <span className="text-[11px] leading-relaxed"
              style={{ color: result.ok ? "var(--cyan)" : "var(--rose)" }}>
              {result.message}
              {result.ok && result.supports_search === false && (
                <span style={{ color: "var(--ink-faint)" }}>
                  {" "}Note: this provider has no live web search, so Competitor
                  Intelligence falls back to public knowledge.
                </span>
              )}
            </span>
          </motion.div>
        )}
        {saved && (
          <motion.div key="saved"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 flex items-center gap-2 overflow-hidden rounded-lg px-3 py-2.5"
            style={{ border: "1px solid var(--cyan)" }}>
            <CheckCircle2 size={13} style={{ color: "var(--cyan)" }} />
            <span className="text-[11px]" style={{ color: "var(--cyan)" }}>{saved}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- actions ---- */}
      <div className="mt-5 flex items-center gap-2">
        {mode === "own" && (
          <button onClick={onTest} disabled={!complete || testing}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 font-mono text-[11px] transition-colors"
            style={{
              border: `1px solid ${complete ? "var(--cyan)" : "var(--line)"}`,
              color: complete ? "var(--cyan)" : "var(--ink-faint)",
              cursor: complete && !testing ? "pointer" : "not-allowed",
            }}>
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {testing ? "testing…" : "test key"}
          </button>
        )}
        {mode === "own" && !!engine.secret?.apiKey && (
          <button onClick={onRemove}
            className="rounded-lg px-3 py-2.5 font-mono text-[11px]"
            style={{ border: "1px solid var(--line)", color: "var(--rose)", cursor: "pointer" }}>
            remove key
          </button>
        )}
        <motion.button
          onClick={onSave} disabled={!canSave}
          whileHover={canSave ? { scale: 1.03 } : undefined}
          whileTap={canSave ? { scale: 0.97 } : undefined}
          className="ml-auto rounded-lg px-6 py-2.5 text-sm font-semibold"
          style={{
            background: canSave ? "var(--amber)" : "var(--panel-2)",
            color: canSave ? "#1a1205" : "var(--ink-faint)",
            boxShadow: canSave ? "0 0 24px -8px var(--glow-amber)" : "none",
            cursor: canSave ? "pointer" : "not-allowed",
          }}>
          {mode === "free" ? "Use free engine" : "Save & use"}
        </motion.button>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
          {label.toUpperCase()}
        </span>
        {hint && <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ModeCard({
  active, onClick, icon: Icon, title, sub, tone,
}: {
  active: boolean; onClick: () => void; icon: typeof Zap;
  title: string; sub: string; tone: "cyan" | "amber";
}) {
  const accent = tone === "cyan" ? "var(--cyan)" : "var(--amber)";
  return (
    <button onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-xl px-3.5 py-3 text-left transition-colors"
      style={{
        border: `1px solid ${active ? "var(--cyan)" : "var(--line)"}`,
        background: active ? "rgba(56,225,212,0.1)" : "rgba(255,255,255,0.015)",
        cursor: "pointer",
      }}>
      <span className="flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: active ? "var(--cyan)" : "var(--ink)" }}>
        <Icon size={13} /> {title}
      </span>
      <span className="font-mono text-[9px]" style={{ color: active ? accent : "var(--ink-faint)" }}>
        {sub}
      </span>
    </button>
  );
}
