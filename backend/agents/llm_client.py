"""LLM client — the single integration point between the agents and the
language model provider.

Every agent calls the model through this module's two public functions:
  - call_json(system, user)              -> structured JSON completion
  - call_json_with_search(system, user)  -> JSON completion grounded in live
                                            web search results

Keeping all provider-specific logic here means the rest of the codebase is
model-agnostic: swapping providers (or upgrading models) only touches this file.

The current implementation targets Google Gemini, configured via environment
variables (see below). The model name is not hard-coded — set MODEL / FALLBACK_MODEL
in the .env to point at any compatible Gemini model.

Environment (.env in the backend/ folder):
  GEMINI_API_KEY = <key>            # required — https://aistudio.google.com/apikey
  MODEL          = gemini-2.5-flash # optional — primary model
  FALLBACK_MODEL = gemini-2.5-flash-lite  # optional — used if primary is overloaded
"""
import os
import json
import re
import time
from pathlib import Path
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load .env from the backend/ folder explicitly, regardless of the working dir.
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

MODEL = os.getenv("MODEL", "gemini-2.5-flash")
# Fallback model used if the primary stays overloaded.
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "gemini-2.5-flash-lite")
_API_KEY = os.getenv("GEMINI_API_KEY")

if not _API_KEY or _API_KEY.strip() in ("", "your-gemini-key-here"):
    raise RuntimeError(
        "GEMINI_API_KEY is not set.\n"
        f"  Expected a .env file at: {_ENV_PATH}\n"
        "  It must contain a line like:  GEMINI_API_KEY=AIza...\n"
        "  Get a free key at https://aistudio.google.com/apikey\n"
        "  (Check the file isn't named '.env.txt' and has no quotes around the key.)"
    )

client = genai.Client(api_key=_API_KEY)

# ONLY genuine transient server problems are worth retrying. A retry on a 4xx
# client error (bad/oversized request, exhausted quota, invalid key) will NEVER
# succeed — retrying it just burns time and quota and hangs the UI.
_TRANSIENT_SUBSTRINGS = ("503", "unavailable", "overloaded", "high demand",
                         "deadline", "timeout", "500 ", "internal error")


def _status_code(err: Exception) -> int | None:
    """Best-effort extraction of an HTTP status code from a google-genai error."""
    code = getattr(err, "code", None) or getattr(err, "status_code", None)
    if isinstance(code, int):
        return code
    # google-genai often embeds the code in the message, e.g. "429 RESOURCE_EXHAUSTED"
    m = re.search(r"\b(4\d\d|5\d\d)\b", str(err))
    return int(m.group(1)) if m else None


def _classify(err: Exception) -> str:
    """Return one of: 'transient' | 'quota' | 'client' | 'unknown'."""
    code = _status_code(err)
    msg = str(err).lower()

    if code in (500, 502, 503, 504) or any(s in msg for s in _TRANSIENT_SUBSTRINGS):
        return "transient"
    if code == 429 or "resource_exhausted" in msg or "quota" in msg:
        return "quota"
    if code is not None and 400 <= code < 500:
        return "client"
    return "unknown"


def _generate_with_retry(*, model_config, contents, max_retries: int = 4):
    """Call Gemini, retrying ONLY genuine transient errors with backoff.
    Falls back to FALLBACK_MODEL if the primary stays transiently unavailable.
    Fails fast (no pointless retries) on client errors and quota exhaustion.
    """
    delay = 1.5
    last_err: Exception | None = None
    models_to_try = [MODEL, FALLBACK_MODEL]

    for model_name in models_to_try:
        model, config = model_config(model_name)
        for attempt in range(max_retries):
            try:
                return client.models.generate_content(
                    model=model, contents=contents, config=config
                )
            except Exception as e:  # noqa: BLE001 - we inspect/classify it
                last_err = e
                kind = _classify(e)

                if kind == "client":
                    # 4xx — request itself is wrong (too large, bad arg). No retry.
                    raise RuntimeError(
                        f"Request rejected by the model ({_status_code(e)}). "
                        f"This usually means the input was malformed or too large. "
                        f"Details: {e}"
                    ) from e

                if kind == "quota":
                    # Free-tier quota hit — retrying in seconds won't help.
                    raise RuntimeError(
                        "Gemini free-tier quota/rate limit reached (429). "
                        "Wait a minute and try again, or reduce request frequency. "
                        f"Details: {e}"
                    ) from e

                # transient or unknown -> retry with backoff
                wait = delay * (2 ** attempt)
                print(f"[retry] {model_name} attempt {attempt+1}/{max_retries} "
                      f"failed ({kind}: {type(e).__name__}); waiting {wait:.1f}s")
                time.sleep(wait)
        print(f"[retry] {model_name} exhausted; trying next model")

    raise last_err if last_err else RuntimeError("generation failed")


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
    """Call the model and parse a JSON object out of the response.

    Uses Gemini's native JSON mode (response_mime_type) so output is reliably
    parseable. Retries transient 503/429 errors and falls back if needed.
    """
    def cfg(model_name):
        return model_name, types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=0.4,
            response_mime_type="application/json",
        )

    resp = _generate_with_retry(model_config=cfg, contents=user)
    return _parse_json(resp.text)


def call_json_with_search(system: str, user: str, max_tokens: int = 3000) -> dict:
    """Like call_json but gives the model Google Search grounding so competitor
    intel is real, not hallucinated.

    Token optimization: a SINGLE call. Grounding can't use strict JSON mode, so
    we instruct the model to end its answer with a ```json fenced block and we
    extract that — avoiding a second formatting call.
    """
    def cfg(model_name):
        return model_name, types.GenerateContentConfig(
            system_instruction=system + "\n\nAfter researching, output ONLY a JSON object "
            "matching the requested schema, wrapped in a ```json code fence. No other prose.",
            max_output_tokens=max_tokens,
            temperature=0.3,
            tools=[types.Tool(google_search=types.GoogleSearch())],
        )

    resp = _generate_with_retry(model_config=cfg, contents=user)
    text = resp.text or ""
    # Prefer a fenced JSON block; fall back to the outermost {...}.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    return _parse_json(text)
