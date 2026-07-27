"""Provider catalog + raw model invocation for every supported LLM vendor.

This is the only place that knows how a specific vendor's API is shaped. Everything
above it (`agents/llm_client.py`, the agents, the orchestrator) is provider-agnostic
and just asks for "text in, text out".

Adding a provider means adding one `ProviderSpec` to `PROVIDERS` and, if it isn't
OpenAI-chat-compatible, one `_call_*` function.

Deliberately no vendor SDKs except google-genai (already a dependency) and a lazy
boto3 for AWS SigV4: plain HTTPS keeps the deploy small and the behaviour explicit.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import httpx

# Generation can legitimately take a while — web-grounded competitor research on a
# slow model is the worst case. Key tests use a much tighter budget (see `timeout`).
_DEFAULT_TIMEOUT = 120.0


@dataclass(frozen=True)
class ProviderSpec:
    """Everything the app needs to know about one provider.

    `api` selects the wire format: "openai" (chat/completions), "gemini",
    "anthropic" or "bedrock".
    """
    id: str
    label: str
    api: str
    default_model: str
    models: tuple[str, ...]
    key_url: str = ""
    key_hint: str = ""
    key_label: str = "API key"
    fallback_model: str | None = None
    base_url: str = ""
    supports_search: bool = False
    needs_region: bool = False
    needs_secret: bool = False
    default_region: str | None = None
    note: str = ""

    def public(self) -> dict:
        """The shape sent to the browser — never includes anything secret."""
        return {
            "id": self.id,
            "label": self.label,
            "default_model": self.default_model,
            "models": list(self.models),
            "key_url": self.key_url,
            "key_hint": self.key_hint,
            "key_label": self.key_label,
            "supports_search": self.supports_search,
            "needs_region": self.needs_region,
            "needs_secret": self.needs_secret,
            "default_region": self.default_region,
            "note": self.note,
        }


# --------------------------------------------------------------------------- #
# Catalog
# --------------------------------------------------------------------------- #
# Model IDs move fast. Every one of these is a *suggestion* — the UI lets the user
# type any model ID their account can reach, and the "test key" button tells them
# immediately if it isn't valid.

_SPECS: tuple[ProviderSpec, ...] = (
    ProviderSpec(
        id="google",
        label="Google Gemini",
        api="gemini",
        default_model="gemini-2.5-flash",
        fallback_model="gemini-2.5-flash-lite",
        models=(
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash",
        ),
        key_url="https://aistudio.google.com/apikey",
        key_hint="AIza…",
        supports_search=True,
        note="Free tier available with no credit card. Adds live Google Search grounding.",
    ),
    ProviderSpec(
        id="anthropic",
        label="Anthropic Claude",
        api="anthropic",
        default_model="claude-sonnet-5",
        fallback_model="claude-haiku-4-5-20251001",
        models=(
            "claude-opus-5",
            "claude-sonnet-5",
            "claude-fable-5",
            "claude-haiku-4-5-20251001",
        ),
        key_url="https://console.anthropic.com/settings/keys",
        key_hint="sk-ant-…",
        supports_search=True,
        note="Strongest architectural reasoning. Supports live web search for competitor intel.",
    ),
    ProviderSpec(
        id="openai",
        label="OpenAI GPT",
        api="openai",
        base_url="https://api.openai.com/v1",
        default_model="gpt-4.1-mini",
        fallback_model="gpt-4.1",
        models=("gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4o"),
        key_url="https://platform.openai.com/api-keys",
        key_hint="sk-…",
        note="Requires a paid account with credit — OpenAI has no free API tier.",
    ),
    ProviderSpec(
        id="bedrock",
        label="AWS Bedrock",
        api="bedrock",
        default_model="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        models=(
            "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "us.amazon.nova-pro-v1:0",
            "us.amazon.nova-lite-v1:0",
            "us.meta.llama3-3-70b-instruct-v1:0",
        ),
        key_url="https://console.aws.amazon.com/iam/home#/security_credentials",
        key_hint="AKIA…",
        key_label="Access key ID",
        needs_region=True,
        needs_secret=True,
        default_region="us-east-1",
        note="Uses the Bedrock Converse API. The IAM user needs bedrock:InvokeModel and "
             "model access enabled in that region.",
    ),
    ProviderSpec(
        id="groq",
        label="Groq",
        api="openai",
        base_url="https://api.groq.com/openai/v1",
        default_model="llama-3.3-70b-versatile",
        models=(
            "llama-3.3-70b-versatile",
            "openai/gpt-oss-120b",
            "moonshotai/kimi-k2-instruct",
            "llama-3.1-8b-instant",
        ),
        key_url="https://console.groq.com/keys",
        key_hint="gsk_…",
        note="Free tier with generous rate limits. Fastest inference of the lot.",
    ),
    ProviderSpec(
        id="mistral",
        label="Mistral AI",
        api="openai",
        base_url="https://api.mistral.ai/v1",
        default_model="mistral-large-latest",
        models=("mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"),
        key_url="https://console.mistral.ai/api-keys",
        note="Has a free experimental tier.",
    ),
    ProviderSpec(
        id="openrouter",
        label="OpenRouter",
        api="openai",
        base_url="https://openrouter.ai/api/v1",
        default_model="anthropic/claude-sonnet-5",
        models=(
            "anthropic/claude-sonnet-5",
            "openai/gpt-4.1-mini",
            "google/gemini-2.5-flash",
            "deepseek/deepseek-chat",
            "meta-llama/llama-3.3-70b-instruct",
        ),
        key_url="https://openrouter.ai/keys",
        key_hint="sk-or-…",
        note="One key, hundreds of models. Includes some free ones (look for ':free').",
    ),
    ProviderSpec(
        id="xai",
        label="xAI Grok",
        api="openai",
        base_url="https://api.x.ai/v1",
        default_model="grok-4",
        models=("grok-4", "grok-3", "grok-3-mini"),
        key_url="https://console.x.ai",
        key_hint="xai-…",
    ),
    ProviderSpec(
        id="deepseek",
        label="DeepSeek",
        api="openai",
        base_url="https://api.deepseek.com/v1",
        default_model="deepseek-chat",
        models=("deepseek-chat", "deepseek-reasoner"),
        key_url="https://platform.deepseek.com/api_keys",
        key_hint="sk-…",
    ),
    ProviderSpec(
        id="custom",
        label="Custom (OpenAI-compatible)",
        api="openai",
        default_model="",
        models=(),
        key_hint="any token your endpoint accepts",
        note="Point this at any OpenAI-compatible /chat/completions endpoint — "
             "Ollama, vLLM, LM Studio, Together, Fireworks, an internal gateway.",
    ),
)

PROVIDERS: dict[str, ProviderSpec] = {s.id: s for s in _SPECS}


def catalog() -> list[dict]:
    return [s.public() for s in _SPECS]


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #

class ProviderError(RuntimeError):
    """A provider call failed. `status` carries the HTTP code when we know it."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def generate(
    cfg: Any,
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
    json_mode: bool,
    search: bool = False,
    model: str | None = None,
    timeout: float = _DEFAULT_TIMEOUT,
) -> str:
    """Run one completion and return the raw text.

    `cfg` is a `llm_runtime.ResolvedLlm` (duck-typed here to keep this module free
    of an import cycle). `model` overrides `cfg.model` so the caller can retry on a
    fallback model without rebuilding the config.
    """
    spec = PROVIDERS[cfg.spec_id]
    model = model or cfg.model
    if not model:
        raise ProviderError("No model specified for this provider.", status=400)

    use_search = search and spec.supports_search
    kwargs = dict(
        system=system, user=user, max_tokens=max_tokens, temperature=temperature,
        json_mode=json_mode, search=use_search, model=model, timeout=timeout,
    )

    if spec.api == "gemini":
        return _call_gemini(cfg, **kwargs)
    if spec.api == "anthropic":
        return _call_anthropic(cfg, **kwargs)
    if spec.api == "bedrock":
        return _call_bedrock(cfg, **kwargs)
    return _call_openai(cfg, spec, **kwargs)


# ---- Google Gemini --------------------------------------------------------- #

def _call_gemini(cfg, *, system, user, max_tokens, temperature, json_mode,
                 search, model, timeout) -> str:
    from google import genai
    from google.genai import types

    # Built per call rather than cached: the client holds the API key, and we do
    # not want a visitor's secret living in a process-wide cache between requests.
    client = genai.Client(
        api_key=cfg.api_key,
        http_options=types.HttpOptions(timeout=int(timeout * 1000)),
    )

    config: dict[str, Any] = {
        "system_instruction": system,
        "max_output_tokens": max_tokens,
        "temperature": temperature,
    }
    if search:
        # Grounding and strict JSON mode are mutually exclusive — the caller asks
        # for a fenced JSON block instead and we extract it.
        config["tools"] = [types.Tool(google_search=types.GoogleSearch())]
    elif json_mode:
        config["response_mime_type"] = "application/json"

    try:
        resp = client.models.generate_content(
            model=model, contents=user,
            config=types.GenerateContentConfig(**config),
        )
    except Exception as e:  # noqa: BLE001 - normalized for the retry layer
        raise ProviderError(str(e), status=_status_from_text(str(e))) from e
    return resp.text or ""


# ---- Anthropic ------------------------------------------------------------- #

def _call_anthropic(cfg, *, system, user, max_tokens, temperature, json_mode,
                    search, model, timeout) -> str:
    messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
    prefilled = False
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "temperature": temperature,
    }
    if search:
        body["tools"] = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]
    elif json_mode:
        # Claude has no JSON mode; prefilling the assistant turn with "{" is the
        # supported way to force a bare JSON object. Can't be combined with tools.
        messages.append({"role": "assistant", "content": "{"})
        prefilled = True
    body["messages"] = messages

    data = _post_json(
        (cfg.base_url or "https://api.anthropic.com/v1").rstrip("/") + "/messages",
        headers={
            "x-api-key": cfg.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body=body,
        timeout=timeout,
    )

    text = "".join(
        block.get("text", "")
        for block in data.get("content", [])
        if block.get("type") == "text"
    )
    return ("{" + text) if prefilled else text


# ---- OpenAI chat/completions (and every compatible vendor) ----------------- #

def _call_openai(cfg, spec, *, system, user, max_tokens, temperature, json_mode,
                 search, model, timeout) -> str:
    base = (cfg.base_url or spec.base_url or "").rstrip("/")
    if not base:
        raise ProviderError(
            "This provider needs a base URL (e.g. http://localhost:11434/v1).", status=400
        )

    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {cfg.api_key}",
        "content-type": "application/json",
    }
    if spec.id == "openrouter":
        # OpenRouter attributes traffic by these; harmless elsewhere so kept scoped.
        headers["HTTP-Referer"] = "https://archaitect-ten.vercel.app"
        headers["X-Title"] = "ArchAItect"

    url = base + "/chat/completions"
    try:
        data = _post_json(url, headers=headers, body=body, timeout=timeout)
    except ProviderError as first:
        retry = _relax_openai_body(body, str(first))
        if retry is None:
            raise
        data = _post_json(url, headers=headers, body=retry, timeout=timeout)

    choices = data.get("choices") or []
    if not choices:
        raise ProviderError("Provider returned no choices.")
    return (choices[0].get("message") or {}).get("content") or ""


def _relax_openai_body(body: dict, error: str) -> dict | None:
    """Newer reasoning models reject `max_tokens` and a custom `temperature`.

    Rather than maintaining a per-model capability table that goes stale, we react
    to the provider's own complaint and retry once with the parameter dropped.
    """
    low = error.lower()
    retry = dict(body)
    changed = False
    if "max_tokens" in low and "max_completion_tokens" not in retry:
        retry.pop("max_tokens", None)
        retry["max_completion_tokens"] = body.get("max_tokens")
        changed = True
    if "temperature" in low and "temperature" in retry:
        retry.pop("temperature")
        changed = True
    if "response_format" in low and "response_format" in retry:
        retry.pop("response_format")
        changed = True
    return retry if changed else None


# ---- AWS Bedrock (Converse API, SigV4 via boto3) --------------------------- #

def _call_bedrock(cfg, *, system, user, max_tokens, temperature, json_mode,
                  search, model, timeout) -> str:
    try:
        import boto3
        from botocore.config import Config as BotoConfig
    except ImportError as e:  # pragma: no cover - boto3 is in requirements.txt
        raise ProviderError(
            "AWS Bedrock support needs boto3 installed on the server.", status=500
        ) from e

    client = boto3.client(
        "bedrock-runtime",
        region_name=cfg.region,
        aws_access_key_id=cfg.api_key,
        aws_secret_access_key=cfg.api_secret,
        aws_session_token=cfg.session_token,
        config=BotoConfig(read_timeout=timeout, connect_timeout=15, retries={"max_attempts": 0}),
    )
    try:
        resp = client.converse(
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
        )
    except Exception as e:  # noqa: BLE001 - botocore raises a wide family
        raise ProviderError(str(e), status=_status_from_boto(e)) from e

    blocks = ((resp.get("output") or {}).get("message") or {}).get("content") or []
    return "".join(b.get("text", "") for b in blocks)


def _status_from_boto(err: Exception) -> int | None:
    meta = getattr(err, "response", None) or {}
    code = (meta.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    if isinstance(code, int):
        return code
    name = (meta.get("Error") or {}).get("Code", "")
    if name in ("UnrecognizedClientException", "InvalidSignatureException",
                "AccessDeniedException", "ValidationException"):
        return 403 if "Access" in name or "Client" in name or "Signature" in name else 400
    if name == "ThrottlingException":
        return 429
    return _status_from_text(str(err))


# --------------------------------------------------------------------------- #
# Shared HTTP helper
# --------------------------------------------------------------------------- #

def _post_json(url: str, *, headers: dict, body: dict, timeout: float) -> dict:
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as e:
        raise ProviderError(f"Provider timed out after {timeout:.0f}s.", status=504) from e
    except httpx.HTTPError as e:
        raise ProviderError(f"Could not reach the provider: {e}", status=None) from e

    if resp.status_code >= 400:
        raise ProviderError(_extract_error(resp), status=resp.status_code)
    try:
        return resp.json()
    except (json.JSONDecodeError, ValueError) as e:
        raise ProviderError("Provider returned a non-JSON response.") from e


def _extract_error(resp: httpx.Response) -> str:
    """Pull the human-readable bit out of a provider error body."""
    try:
        payload = resp.json()
    except (json.JSONDecodeError, ValueError):
        return f"{resp.status_code} {resp.text[:300]}"
    err = payload.get("error")
    if isinstance(err, dict):
        msg = err.get("message") or err.get("type") or json.dumps(err)[:300]
    elif isinstance(err, str):
        msg = err
    else:
        msg = payload.get("message") or json.dumps(payload)[:300]
    return f"{resp.status_code} {msg}"


def _status_from_text(text: str) -> int | None:
    m = re.search(r"\b(4\d\d|5\d\d)\b", text)
    return int(m.group(1)) if m else None
