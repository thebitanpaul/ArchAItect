"""LLM client — the single integration point between the agents and whichever
language model the current request is configured to use.

Every agent calls the model through this module's two public functions:
  - call_json(system, user)              -> structured JSON completion
  - call_json_with_search(system, user)  -> JSON completion grounded in live
                                            web search results (when the active
                                            provider supports it)

Keeping all model-call logic here means the rest of the codebase is provider
agnostic. Which provider/model/key is used is decided per request by
`llm_runtime.active()` — either the shared "phiUture free engine" key held in the
server's environment, or a key the visitor supplied from their browser (BYO key).

This module owns: retry policy, model fallback, error classification, secret
redaction on the way out, and JSON extraction. It owns no credentials.

Server environment (backend/.env) — all optional now that BYO keys exist:
  GEMINI_API_KEY = <key>            # powers the free phiUture engine option
  MODEL          = gemini-2.5-flash # model for the free engine
  FALLBACK_MODEL = gemini-2.5-flash-lite
"""
import json
import re
import time

from llm_providers import ProviderError, generate
from llm_runtime import active, free_tier, redact

# ONLY genuine transient server problems are worth retrying. A retry on a 4xx
# client error (bad/oversized request, exhausted quota, invalid key) will NEVER
# succeed — retrying it just burns time and quota and hangs the UI.
_TRANSIENT_SUBSTRINGS = ("503", "unavailable", "overloaded", "high demand",
                         "deadline", "timeout", "timed out", "500 ", "502 ", "504 ",
                         "internal error", "internal server error", "capacity")

_SEARCH_FENCE_INSTRUCTION = (
    "\n\nAfter researching, output ONLY a JSON object matching the requested schema, "
    "wrapped in a ```json code fence. No other prose."
)
_NO_SEARCH_INSTRUCTION = (
    "\n\nYou do NOT have live web access on this model. Rely only on architecture "
    "details you are confident are publicly documented, and make each source_hint "
    "state plainly that it comes from general public knowledge rather than a live "
    "lookup. Never invent a specific source. Output ONLY a JSON object matching the "
    "requested schema, wrapped in a ```json code fence."
)


def _classify(status: int | None, message: str) -> str:
    """Return one of: 'transient' | 'quota' | 'auth' | 'client' | 'unknown'."""
    msg = message.lower()

    if status in (500, 502, 503, 504) or any(s in msg for s in _TRANSIENT_SUBSTRINGS):
        return "transient"
    if status == 429 or "resource_exhausted" in msg or "quota" in msg \
            or "rate limit" in msg or "too many requests" in msg:
        return "quota"
    if status in (401, 403) or "invalid api key" in msg or "incorrect api key" in msg \
            or "unauthorized" in msg or "api key not valid" in msg \
            or "permission" in msg or "authentication" in msg:
        return "auth"
    if status is not None and 400 <= status < 500:
        return "client"
    return "unknown"


class LlmCallError(RuntimeError):
    """A model call failed, carrying the classification so the HTTP layer can pick
    an honest status code — a rejected user key is a 400, not a server error."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind  # 'auth' | 'quota' | 'client' | 'unknown'


def _friendly(kind: str, message: str, cfg) -> LlmCallError:
    """Turn a provider failure into something a user can act on."""
    who = "the free phiUture engine" if cfg.is_free_tier else f"your {cfg.spec.label} key"

    if kind == "auth":
        if cfg.is_free_tier:
            return LlmCallError(kind,
                "The shared phiUture key was rejected by the provider. Add your own "
                f"API key in engine settings to keep going. Details: {message}"
            )
        return LlmCallError(kind,
            f"{cfg.spec.label} rejected your API key. Re-check it in engine settings "
            f"(plus the region, for AWS) and use 'Test key'. Details: {message}"
        )
    if kind == "quota":
        return LlmCallError(kind,
            f"Rate limit / quota reached on {who}. Wait a minute and retry, "
            f"or switch to a provider with more headroom. Details: {message}"
        )
    if kind == "client":
        return LlmCallError(kind,
            f"Request rejected by {cfg.spec.label} ({message}). Usually a model ID "
            f"that account can't reach, or an input that's too large. Current model: "
            f"'{cfg.model}'."
        )
    return LlmCallError("unknown", f"{cfg.spec.label} call failed: {message}")


def _generate_with_retry(*, system: str, user: str, max_tokens: int,
                         temperature: float, json_mode: bool, search: bool,
                         max_retries: int = 4) -> str:
    """Call the active provider, retrying ONLY genuine transient errors with
    backoff. Falls back to the provider's secondary model if the primary stays
    transiently unavailable. Fails fast (no pointless retries) on bad keys, client
    errors and quota exhaustion.
    """
    cfg = active()
    delay = 1.5
    last: ProviderError | None = None
    models = [cfg.model] + ([cfg.fallback_model] if cfg.fallback_model
                            and cfg.fallback_model != cfg.model else [])

    for model_name in models:
        for attempt in range(max_retries):
            if cfg.is_free_tier:
                free_tier.record(cfg.client_ip)
            try:
                return generate(
                    cfg, system=system, user=user, max_tokens=max_tokens,
                    temperature=temperature, json_mode=json_mode, search=search,
                    model=model_name,
                )
            except ProviderError as e:
                last = e
                message = redact(str(e))
                kind = _classify(e.status, message)

                if kind in ("auth", "client", "quota"):
                    raise _friendly(kind, message, cfg) from e

                wait = delay * (2 ** attempt)
                print(f"[retry] {cfg.provider}/{model_name} attempt "
                      f"{attempt + 1}/{max_retries} failed ({kind}); "
                      f"waiting {wait:.1f}s")
                time.sleep(wait)
        if len(models) > 1:
            print(f"[retry] {model_name} exhausted; trying next model")

    raise _friendly("unknown", redact(str(last)) if last else "generation failed", cfg)


def _strip_fences(text: str) -> str:
    """Remove ```json ... ``` fences if the model added them."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text)
    text = re.sub(r"```$", "", text.strip())
    return text.strip()


def _parse_json(text: str) -> dict:
    cleaned = _strip_fences(text)
    if not cleaned:
        raise RuntimeError("Model returned an empty response.")
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        # Likely the output was cut off at max_output_tokens (unbalanced braces).
        if cleaned.count("{") > cleaned.count("}"):
            raise RuntimeError(
                "Model response was truncated before completing the JSON "
                "(hit the output token limit). Try a more focused document."
            )
        raise RuntimeError(f"Could not parse model JSON output. Got: {cleaned[:200]}")


def call_json(system: str, user: str, max_tokens: int = 4000) -> dict:
    """Call the active model and parse a JSON object out of the response.

    Uses the provider's native JSON mode where one exists (Gemini's
    response_mime_type, OpenAI's response_format, an assistant prefill for Claude)
    so output is reliably parseable. Retries transient errors and falls back to a
    secondary model if needed.
    """
    text = _generate_with_retry(
        system=system, user=user, max_tokens=max_tokens,
        temperature=0.4, json_mode=True, search=False,
    )
    return _parse_json(text)


def call_json_with_search(system: str, user: str, max_tokens: int = 3000) -> dict:
    """Like call_json but grounds the answer in live web search when the active
    provider supports it, so competitor intel is real rather than hallucinated.

    Token optimization: a SINGLE call. Grounding can't use strict JSON mode, so we
    instruct the model to end its answer with a ```json fenced block and extract
    that — avoiding a second formatting call.

    Providers without a search tool (OpenAI chat, Groq, Bedrock…) degrade to an
    ungrounded call that is explicitly told to say so in `source_hint`.
    """
    cfg = active()
    grounded = cfg.spec.supports_search
    text = _generate_with_retry(
        system=system + (_SEARCH_FENCE_INSTRUCTION if grounded else _NO_SEARCH_INSTRUCTION),
        user=user, max_tokens=max_tokens, temperature=0.3,
        json_mode=True, search=True,
    )

    # Prefer a fenced JSON block; fall back to the outermost {...}.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            data = json.loads(fence.group(1))
        except json.JSONDecodeError:
            data = _parse_json(text)
    else:
        data = _parse_json(text)

    data.setdefault("grounded", grounded)
    return data


def probe(timeout: float = 30.0) -> dict:
    """Smoke-test the active credentials with the smallest possible call.

    Used by POST /api/llm/test so a user can verify a key before saving it.
    Returns {ok, model, latency_ms}; raises RuntimeError with an actionable
    message on failure.
    """
    cfg = active()
    started = time.perf_counter()
    try:
        text = generate(
            cfg,
            system="You are a connectivity probe. Reply with JSON only.",
            user='Reply with exactly this JSON and nothing else: {"ok": true}',
            max_tokens=64, temperature=0.0, json_mode=True, search=False,
            timeout=timeout,
        )
    except ProviderError as e:
        message = redact(str(e))
        raise _friendly(_classify(e.status, message), message, cfg) from e

    latency = int((time.perf_counter() - started) * 1000)
    if not (text or "").strip():
        raise RuntimeError(
            f"{cfg.spec.label} accepted the key but returned an empty response for "
            f"model '{cfg.model}'. Try a different model."
        )
    return {"ok": True, "model": cfg.model, "latency_ms": latency}
