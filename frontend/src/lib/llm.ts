/**
 * llm — which engine the app is currently talking through.
 *
 * Two possible engines:
 *   - the shared "phiUture free engine" (no key, availability depends on live
 *     traffic against a rate-limited shared key), or
 *   - the visitor's own provider + API key (BYO), which is stored encrypted in
 *     the browser (see `keyvault.ts`) and never sent anywhere except to our API
 *     as a pass-through credential for that one request.
 *
 * This is a tiny module-level store rather than React context because `api.ts`
 * needs to read the current credentials synchronously when building a request
 * body, from outside the component tree.
 */
import { useSyncExternalStore } from "react";
import { API_BASE } from "@/lib/config";
import { forgetSecret, loadSecret, saveSecret, type VaultSecret } from "@/lib/keyvault";

export const FREE_PROVIDER = "phiuture";

/** Non-secret preferences. Safe to keep in localStorage. */
const PREFS_KEY = "archaitect.engine.prefs";
/** Whether the visitor has already seen the "add your own key" nudge. */
const HINT_KEY = "archaitect.engine.hintSeen";

export type ProviderInfo = {
  id: string;
  label: string;
  default_model: string;
  models: string[];
  key_url: string;
  key_hint: string;
  key_label: string;
  supports_search: boolean;
  needs_region: boolean;
  needs_secret: boolean;
  default_region: string | null;
  note: string;
};

export type FreeTierStatus = {
  available: boolean;
  configured: boolean;
  reason: string | null;
  message: string;
  remaining: number;
  hourly_limit: number;
  daily_limit: number;
  resets_in_seconds: number;
};

/** What travels in the `llm` field of every analysis request. */
export type LlmPayload = {
  provider: string;
  model?: string;
  api_key?: string;
  api_secret?: string;
  session_token?: string;
  region?: string;
  base_url?: string;
};

export type EnginePrefs = {
  /** `FREE_PROVIDER` or a provider id from the catalog. */
  provider: string;
  /** Blank means "let the provider default decide". */
  model: string;
  region: string;
  baseUrl: string;
  remember: boolean;
};

export type EngineState = EnginePrefs & {
  /** Loaded from the vault; null when the user has no key saved. */
  secret: VaultSecret | null;
  /** False until the vault + catalog have been read once. */
  ready: boolean;
  providers: ProviderInfo[];
  freeTier: FreeTierStatus | null;
};

const DEFAULT_PREFS: EnginePrefs = {
  provider: FREE_PROVIDER,
  model: "",
  region: "",
  baseUrl: "",
  remember: true,
};

/**
 * Offline copy of the catalog so the settings dialog is usable even when the
 * backend is asleep (Render free instances cold-start). Refreshed from
 * GET /api/llm/providers as soon as that responds — the server is the source of
 * truth for model lists.
 */
const FALLBACK_PROVIDERS: ProviderInfo[] = [
  {
    id: "google", label: "Google Gemini", default_model: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    key_url: "https://aistudio.google.com/apikey", key_hint: "AIza…",
    key_label: "API key", supports_search: true, needs_region: false,
    needs_secret: false, default_region: null,
    note: "Free tier available with no credit card.",
  },
  {
    id: "anthropic", label: "Anthropic Claude", default_model: "claude-sonnet-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
    key_url: "https://console.anthropic.com/settings/keys", key_hint: "sk-ant-…",
    key_label: "API key", supports_search: true, needs_region: false,
    needs_secret: false, default_region: null, note: "",
  },
  {
    id: "openai", label: "OpenAI GPT", default_model: "gpt-4.1-mini",
    models: ["gpt-5.1", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4o"],
    key_url: "https://platform.openai.com/api-keys", key_hint: "sk-…",
    key_label: "API key", supports_search: false, needs_region: false,
    needs_secret: false, default_region: null, note: "",
  },
  {
    id: "bedrock", label: "AWS Bedrock",
    default_model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    models: ["us.anthropic.claude-sonnet-4-5-20250929-v1:0", "us.amazon.nova-pro-v1:0"],
    key_url: "https://console.aws.amazon.com/iam/home#/security_credentials",
    key_hint: "AKIA…", key_label: "Access key ID", supports_search: false,
    needs_region: true, needs_secret: true, default_region: "us-east-1", note: "",
  },
];

// --------------------------------------------------------------------------- //
// Store
// --------------------------------------------------------------------------- //

function readPrefs(): EnginePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<EnginePrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: EnginePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage disabled — prefs just won't survive a reload */
  }
}

let state: EngineState = {
  ...readPrefs(),
  secret: null,
  ready: false,
  providers: FALLBACK_PROVIDERS,
  freeTier: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<EngineState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(): EngineState {
  return state;
}

/** Subscribe a component to engine state. */
export function useEngine(): EngineState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function providerInfo(id: string): ProviderInfo | null {
  return state.providers.find((p) => p.id === id) ?? null;
}

/** True when the app is set up to use the visitor's own key. */
export function usingOwnKey(s: EngineState = state): boolean {
  return s.provider !== FREE_PROVIDER && !!s.secret?.apiKey;
}

// --------------------------------------------------------------------------- //
// Bootstrap
// --------------------------------------------------------------------------- //

let bootstrap: Promise<void> | null = null;

/** Read the vault and fetch the provider catalog. Safe to call more than once. */
export function initEngine(): Promise<void> {
  bootstrap ??= (async () => {
    // Decrypting the vault is what settles which engine we're on, so it must land
    // before any request is built — see `requestLlm`.
    const secret = await loadSecret();
    set({ secret, ready: true });

    try {
      const res = await fetch(`${API_BASE}/api/llm/providers`);
      if (res.ok) {
        const json = (await res.json()) as { providers: ProviderInfo[] };
        if (json.providers?.length) set({ providers: json.providers });
      }
    } catch {
      // Keep the bundled catalog; the dialog stays fully usable.
    }
  })();
  return bootstrap;
}

/** Poll the backend for liveness + free-engine availability. */
export async function refreshHealth(): Promise<"online" | "offline"> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return "offline";
    const json = (await res.json()) as { free_tier?: FreeTierStatus };
    set({ freeTier: json.free_tier ?? null });
    return "online";
  } catch {
    return "offline";
  }
}

// --------------------------------------------------------------------------- //
// Mutations
// --------------------------------------------------------------------------- //

/** Switch to the shared free engine and forget any saved key. */
export async function switchToFreeEngine(): Promise<void> {
  const prefs: EnginePrefs = { ...DEFAULT_PREFS, remember: state.remember };
  writePrefs(prefs);
  await forgetSecret();
  set({ ...prefs, secret: null });
}

/** Save the visitor's own credentials. Returns whether they were persisted. */
export async function saveOwnKey(
  prefs: Omit<EnginePrefs, "remember"> & { remember: boolean },
  secret: VaultSecret
): Promise<boolean> {
  const persisted = await saveSecret(secret, prefs.remember);
  writePrefs(prefs);
  set({ ...prefs, secret });
  return persisted;
}

// --------------------------------------------------------------------------- //
// Request payload
// --------------------------------------------------------------------------- //

/**
 * Build the `llm` field for an API request from arbitrary settings. Exported so the
 * settings dialog can test a key that hasn't been saved yet.
 */
export function buildPayload(
  prefs: Pick<EnginePrefs, "provider" | "model" | "region" | "baseUrl">,
  secret: VaultSecret | null
): LlmPayload {
  if (prefs.provider === FREE_PROVIDER || !secret?.apiKey) {
    return { provider: FREE_PROVIDER };
  }
  const payload: LlmPayload = { provider: prefs.provider, api_key: secret.apiKey };
  if (prefs.model.trim()) payload.model = prefs.model.trim();
  if (secret.apiSecret) payload.api_secret = secret.apiSecret;
  if (secret.sessionToken) payload.session_token = secret.sessionToken;
  if (prefs.region.trim()) payload.region = prefs.region.trim();
  if (prefs.baseUrl.trim()) payload.base_url = prefs.baseUrl.trim();
  return payload;
}

/**
 * The credentials to send with a request — awaited by `api.ts` on every call.
 *
 * Awaiting the bootstrap matters: reading the encrypted key out of IndexedDB is
 * asynchronous, so a request built before that resolves would quietly fall back to
 * the shared free key instead of the user's own.
 */
export async function requestLlm(): Promise<LlmPayload> {
  await initEngine();
  return buildPayload(state, state.secret);
}

// --------------------------------------------------------------------------- //
// First-visit nudge
// --------------------------------------------------------------------------- //

export function hintAlreadySeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

// --------------------------------------------------------------------------- //
// Key test
// --------------------------------------------------------------------------- //

export type TestResult = {
  ok: boolean;
  message: string;
  model?: string;
  latency_ms?: number;
  supports_search?: boolean;
};

/** Ask the backend to do one tiny call with these credentials. Nothing is saved. */
export async function testKey(payload: LlmPayload): Promise<TestResult> {
  try {
    const res = await fetch(`${API_BASE}/api/llm/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm: payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: json.detail ?? `Test failed (${res.status}).` };
    }
    return json as TestResult;
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the ArchAItect API. It may be waking up — retry in a moment.",
    };
  }
}
