"""Per-request LLM configuration — the plumbing that makes BYO ("bring your own")
API keys possible.

A browser may send its own provider + key with every request. That credential must
be used for *that request only* and must never be written to disk, logged, or
leaked back through an error message. This module provides:

  LlmConfig      - the validated shape the browser sends
  use_llm(cfg)   - context manager that binds a config to the current request
  active()       - what the agents read (they never see the HTTP layer)
  resolve(cfg)   - turns a browser config into concrete credentials, substituting
                   the server's shared "phiUture free tier" key when asked
  redact(text)   - strips secrets out of any string before it leaves the process
  free_tier      - traffic gate for the shared key

Nothing here persists. The config lives in a ContextVar for the lifetime of the
request and is discarded when the response ends.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from llm_providers import PROVIDERS, ProviderSpec

# Load .env from the backend/ folder explicitly, regardless of the working dir.
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

#: The shared key that powers the free "phiUture engine" option. Optional — the
#: server runs fine without it, the free tier is simply reported as unavailable
#: and users must supply their own key.
SERVER_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
if SERVER_KEY in ("your-gemini-key-here",):
    SERVER_KEY = ""

SERVER_MODEL = os.getenv("MODEL", "gemini-2.5-flash")
SERVER_FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "gemini-2.5-flash-lite")

FREE_TIER_PROVIDER = "phiuture"


# --------------------------------------------------------------------------- #
# What the browser sends
# --------------------------------------------------------------------------- #

class LlmConfig(BaseModel):
    """Credentials supplied by the browser for a single request.

    `provider="phiuture"` (the default) means "use the shared free key" and no
    secrets are present at all.
    """
    provider: str = FREE_TIER_PROVIDER
    model: str | None = None
    api_key: str | None = None
    #: AWS only — secret access key / optional session token / region.
    api_secret: str | None = None
    session_token: str | None = None
    region: str | None = None
    #: Escape hatch for self-hosted OpenAI-compatible endpoints (Ollama, vLLM…).
    base_url: str | None = None

    model_config = {"extra": "ignore"}

    def normalized_provider(self) -> str:
        return (self.provider or FREE_TIER_PROVIDER).strip().lower()


class ResolvedLlm(BaseModel):
    """A config with the free-tier indirection collapsed into real credentials."""
    provider: str
    spec_id: str
    model: str
    fallback_model: str | None = None
    api_key: str = ""
    api_secret: str | None = None
    session_token: str | None = None
    region: str | None = None
    base_url: str | None = None
    #: True when this request is spending the shared phiUture key.
    is_free_tier: bool = False
    client_ip: str = ""

    model_config = {"extra": "ignore"}

    @property
    def spec(self) -> ProviderSpec:
        return PROVIDERS[self.spec_id]

    def secrets(self) -> list[str]:
        return [s for s in (self.api_key, self.api_secret, self.session_token) if s]


class LlmConfigError(ValueError):
    """The browser's config is unusable — a 400, not a 500."""


class FreeTierBusy(RuntimeError):
    """The shared key is saturated. The user should add their own."""


# --------------------------------------------------------------------------- #
# Resolution
# --------------------------------------------------------------------------- #

def resolve(cfg: LlmConfig | None, *, client_ip: str = "") -> ResolvedLlm:
    """Turn a browser config into concrete credentials, or raise LlmConfigError."""
    cfg = cfg or LlmConfig()
    provider = cfg.normalized_provider()

    if provider == FREE_TIER_PROVIDER:
        if not SERVER_KEY:
            raise LlmConfigError(
                "The free phiUture engine isn't configured on this server. "
                "Add your own API key to continue — click the engine pill in the header."
            )
        return ResolvedLlm(
            provider=FREE_TIER_PROVIDER,
            spec_id="google",
            model=SERVER_MODEL,
            fallback_model=SERVER_FALLBACK_MODEL,
            api_key=SERVER_KEY,
            is_free_tier=True,
            client_ip=client_ip,
        )

    spec = PROVIDERS.get(provider)
    if spec is None:
        raise LlmConfigError(f"Unknown provider '{provider}'.")

    api_key = (cfg.api_key or "").strip()
    if not api_key:
        raise LlmConfigError(f"An API key is required for {spec.label}.")

    api_secret = (cfg.api_secret or "").strip() or None
    if spec.needs_secret and not api_secret:
        raise LlmConfigError(f"{spec.label} also needs a secret access key.")

    region = (cfg.region or "").strip() or spec.default_region
    if spec.needs_region and not region:
        raise LlmConfigError(f"{spec.label} needs a region (e.g. us-east-1).")

    model = (cfg.model or "").strip() or spec.default_model
    base_url = (cfg.base_url or "").strip() or None
    if base_url and not base_url.startswith(("http://", "https://")):
        raise LlmConfigError("Custom base URL must start with http:// or https://.")

    return ResolvedLlm(
        provider=provider,
        spec_id=spec.id,
        model=model,
        # Only fall back to a different model when the user didn't pin one.
        fallback_model=spec.fallback_model if not (cfg.model or "").strip() else None,
        api_key=api_key,
        api_secret=api_secret,
        session_token=(cfg.session_token or "").strip() or None,
        region=region,
        base_url=base_url,
        client_ip=client_ip,
    )


# --------------------------------------------------------------------------- #
# Request-scoped binding
# --------------------------------------------------------------------------- #

_active: ContextVar[ResolvedLlm | None] = ContextVar("archaitect_llm", default=None)


@contextmanager
def use_llm(resolved: ResolvedLlm):
    """Bind credentials for the duration of one unit of work (see main.py)."""
    token = _active.set(resolved)
    try:
        yield resolved
    finally:
        _active.reset(token)


def stream_with_llm(resolved: ResolvedLlm, gen):
    """Iterate a generator with `resolved` bound around every single step.

    Starlette pulls each item of a sync generator with its own
    `anyio.to_thread.run_sync` call, and each of those copies the context afresh —
    so a ContextVar set inside the generator body does NOT survive to the next
    `next()`, and resetting it later raises "created in a different Context".
    Re-binding per step is therefore what makes request-scoped credentials work at
    all for the SSE pipeline. Without it, only the first step would see the
    visitor's key and everything after it would silently fall back.

    Exceptions are redacted here, while the credentials are still bound and
    `redact()` can still see which secrets to strip.
    """
    while True:
        with use_llm(resolved):
            try:
                item = next(gen)
            except StopIteration:
                return
            except Exception as e:  # noqa: BLE001 - re-raised, redacted
                raise RuntimeError(redact(str(e))) from e
        yield item


def active() -> ResolvedLlm:
    """The credentials for the in-flight request. Agents call this indirectly.

    Raises rather than falling back to the shared free key: a missing binding is a
    wiring bug, and quietly spending the server's key on a request that asked for
    the visitor's own would be both wrong and expensive.
    """
    cur = _active.get()
    if cur is None:
        raise RuntimeError(
            "No LLM credentials are bound for this request. This is a server "
            "wiring bug — the endpoint must run inside use_llm()/stream_with_llm()."
        )
    return cur


def redact(text: str) -> str:
    """Remove any secret belonging to the current request from a string.

    Provider SDKs and HTTP errors have a habit of echoing request details. This
    is the last line of defence before an error reaches the browser or a log.
    """
    cur = _active.get()
    if not cur:
        return text
    out = text
    for secret in cur.secrets():
        if len(secret) >= 8:
            out = out.replace(secret, f"{secret[:4]}…[redacted]")
    return out


# --------------------------------------------------------------------------- #
# Free-tier traffic gate
# --------------------------------------------------------------------------- #

def _int_env(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


@dataclass
class _Window:
    """Rolling counter of hit timestamps."""
    seconds: int
    limit: int
    hits: deque[float] = field(default_factory=deque)

    def prune(self, now: float) -> None:
        cutoff = now - self.seconds
        while self.hits and self.hits[0] < cutoff:
            self.hits.popleft()

    def remaining(self, now: float) -> int:
        self.prune(now)
        return max(0, self.limit - len(self.hits))

    def resets_in(self, now: float) -> int:
        self.prune(now)
        if not self.hits:
            return 0
        return max(0, int(self.hits[0] + self.seconds - now))


class FreeTierGate:
    """Availability of the shared phiUture key, as a function of live traffic.

    Deliberately in-memory and per-instance: it protects the shared key from a
    traffic spike, it is not billing. Three windows — global hourly, global
    daily, and per-IP hourly so one visitor can't drain the pool alone.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hour = _Window(3600, _int_env("FREE_TIER_HOURLY_LIMIT", 150))
        self._day = _Window(86400, _int_env("FREE_TIER_DAILY_LIMIT", 900))
        self._ip_limit = _int_env("FREE_TIER_IP_HOURLY_LIMIT", 18)
        self._ips: dict[str, _Window] = {}

    @property
    def configured(self) -> bool:
        return bool(SERVER_KEY)

    def _ip_window(self, ip: str) -> _Window:
        win = self._ips.get(ip)
        if win is None:
            win = _Window(3600, self._ip_limit)
            self._ips[ip] = win
        return win

    def _sweep(self, now: float) -> None:
        """Drop IP windows that have gone quiet, so the dict can't grow forever."""
        if len(self._ips) < 512:
            return
        stale = [ip for ip, w in self._ips.items() if w.remaining(now) == w.limit]
        for ip in stale:
            del self._ips[ip]

    def status(self, ip: str = "") -> dict:
        now = time.time()
        with self._lock:
            if not self.configured:
                return {
                    "available": False,
                    "configured": False,
                    "reason": "no_server_key",
                    "message": "The free phiUture engine isn't configured on this server.",
                    "remaining": 0,
                    "hourly_limit": self._hour.limit,
                    "daily_limit": self._day.limit,
                    "resets_in_seconds": 0,
                }
            hour_left = self._hour.remaining(now)
            day_left = self._day.remaining(now)
            ip_left = self._ip_window(ip).remaining(now) if ip else self._ip_limit
            remaining = min(hour_left, day_left, ip_left)

            reason = None
            if day_left == 0:
                reason, resets = "daily_limit", self._day.resets_in(now)
            elif hour_left == 0:
                reason, resets = "hourly_limit", self._hour.resets_in(now)
            elif ip_left == 0:
                reason, resets = "per_visitor_limit", self._ip_window(ip).resets_in(now)
            else:
                resets = 0

            return {
                "available": reason is None,
                "configured": True,
                "reason": reason,
                "message": _busy_message(reason),
                "remaining": remaining,
                "hourly_limit": self._hour.limit,
                "daily_limit": self._day.limit,
                "resets_in_seconds": resets,
            }

    def ensure_available(self, ip: str = "") -> None:
        """Fail fast before starting a pipeline. Raises FreeTierBusy."""
        st = self.status(ip)
        if not st["available"]:
            raise FreeTierBusy(st["message"])

    def record(self, ip: str = "") -> None:
        """Count one model call against the shared key. Never raises."""
        now = time.time()
        with self._lock:
            if not self.configured:
                return
            self._hour.hits.append(now)
            self._day.hits.append(now)
            if ip:
                self._ip_window(ip).hits.append(now)
            self._sweep(now)


def _busy_message(reason: str | None) -> str:
    if reason is None:
        return "The free phiUture engine is available."
    if reason == "per_visitor_limit":
        return (
            "You've used your share of the free phiUture engine for this hour. "
            "Add your own API key to keep going — it's instant and stays in your browser."
        )
    if reason == "no_server_key":
        return "The free phiUture engine isn't configured on this server."
    return (
        "The free phiUture engine is busy right now — traffic is above what the "
        "shared key can serve. Add your own API key to keep going, or try again shortly."
    )


free_tier = FreeTierGate()
