import type {
  Architecture, StepEvent, Review, Roadmap, Competitor, Resilience, Edge, Service, Metrics, Traceability,
} from "@/types/architecture";
import { API_BASE } from "@/lib/config";
import { requestLlm, type LlmPayload } from "@/lib/llm";

export { API_BASE };

/**
 * Every request that can spend tokens carries the engine credentials for the
 * current session — either `{provider:"phiuture"}` for the shared free key, or the
 * visitor's own provider + key read out of the browser vault. The key is a
 * pass-through: the backend uses it for that one call and never stores it.
 */
async function withLlm<T extends object>(body: T): Promise<T & { llm: LlmPayload }> {
  return { ...body, llm: await requestLlm() };
}

/** Pull the readable reason out of a FastAPI error response. */
async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    if (typeof json?.detail === "string") return json.detail;
  } catch {
    /* not JSON */
  }
  return fallback;
}

export async function extractText(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/extract-text`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Extract failed: ${res.status}`);
  const json = await res.json();
  return json.text as string;
}

/**
 * Streams the agent pipeline. Calls `onEvent` for every SSE event and
 * resolves with the final Architecture when the `result` event arrives.
 *
 * We parse the SSE stream manually with a ReadableStream reader because the
 * native EventSource API only supports GET, and our endpoint is a POST.
 */
export async function analyzeStream(
  document: string,
  onEvent: (e: StepEvent) => void
): Promise<Architecture> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await withLlm({ document })),
  });

  if (!res.ok || !res.body) {
    // Credential and free-tier problems are rejected before the stream opens, so
    // they arrive here as a normal JSON error with an actionable message.
    throw new Error(await errorDetail(res, `Analyze failed: ${res.status}`));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: Architecture | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? ""; // keep incomplete frame in buffer

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;

      let evt: StepEvent;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      onEvent(evt);

      if (evt.status === "error") {
        throw new Error(evt.message || "Pipeline error");
      }
      if (evt.step === "result" && evt.status === "complete") {
        final = evt.data as Architecture;
      }
    }
  }

  if (!final) throw new Error("Stream ended without a result event.");
  return final;
}

/** On-demand analysis calls (simple JSON, not streaming). */
async function postJson<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await withLlm(body)),
  });
  if (!res.ok) {
    throw new Error(await errorDetail(res, `${path} failed: ${res.status}`));
  }
  return res.json() as Promise<T>;
}

export function fetchReview(services: unknown[], edges: unknown[]) {
  return postJson<Review>("/api/review", { services, edges });
}
export function fetchRoadmap(services: unknown[], edges: unknown[]) {
  return postJson<Roadmap>("/api/roadmap", { services, edges });
}
export function fetchCompetitor(services: unknown[], appType: string) {
  return postJson<Competitor>("/api/competitor", { services, app_type: appType });
}
export function fetchTraceability(functionalAreas: unknown[], services: unknown[]) {
  return postJson<Traceability>("/api/traceability", { functional_areas: functionalAreas, services });
}
export function recomputeArch(services: unknown[], edges: unknown[]) {
  return postJson<{ edges: Edge[]; resilience: Resilience; metrics: Metrics }>(
    "/api/recompute", { services, edges }
  );
}
export function applyFix(services: unknown[], instruction: string) {
  return postJson<{
    services: Service[]; change_note: string; edges: Edge[];
    shared_concerns: string[]; resilience: Resilience; metrics: Metrics;
  }>("/api/apply-fix", { services, instruction });
}
