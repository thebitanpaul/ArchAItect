"""FastAPI app — exposes the agentic pipeline over HTTP.

Endpoints:
  GET  /api/health         -> liveness + free-tier availability
  GET  /api/llm/providers  -> catalog of supported LLM providers/models
  POST /api/llm/test       -> smoke-test a user-supplied key (nothing is stored)
  POST /api/extract-text   -> extract text from an uploaded file (pdf/txt/md)
  POST /api/analyze        -> stream the pipeline as Server-Sent Events (SSE)

Bring-your-own keys: every analysis endpoint accepts an optional `llm` object
carrying the visitor's provider + key. It is used for that request only — never
logged, never written to disk, and stripped out of any error message on the way
back (see `llm_runtime.redact`). Omitting it means "use the shared free phiUture
engine", which is rate-limited by live traffic.
"""
import json
import io
import os
from contextlib import contextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader

from agents.llm_client import LlmCallError, probe
from llm_providers import catalog
from llm_runtime import (
    FREE_TIER_PROVIDER, FreeTierBusy, LlmConfig, LlmConfigError, free_tier,
    redact, resolve, stream_with_llm, use_llm,
)
from orchestrator import (
    run_pipeline, run_review, run_roadmap, run_competitor, recompute, apply_fix,
    run_traceability,
)

app = FastAPI(title="ArchAItect API")

# Allowed browser origins. Local Vite dev runs on 5173; in production set the
# CORS_ORIGINS env var to your deployed frontend URL(s), comma-separated.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request bodies
# --------------------------------------------------------------------------- #

class AnalyzeRequest(BaseModel):
    document: str
    llm: LlmConfig | None = None


class AnalysisRequest(BaseModel):
    services: list
    edges: list = []
    app_type: str = "software system"
    llm: LlmConfig | None = None


class RecomputeRequest(BaseModel):
    services: list
    edges: list | None = None
    llm: LlmConfig | None = None


class FixRequest(BaseModel):
    services: list
    instruction: str
    llm: LlmConfig | None = None


class TraceabilityRequest(BaseModel):
    functional_areas: list
    services: list
    llm: LlmConfig | None = None


class LlmTestRequest(BaseModel):
    llm: LlmConfig


# --------------------------------------------------------------------------- #
# LLM credential plumbing
# --------------------------------------------------------------------------- #

def _client_ip(request: Request) -> str:
    """Best-effort visitor identity for per-visitor free-tier limits.

    Render/Vercel put the real client first in X-Forwarded-For. This is only used
    for fair-use accounting, so a spoofed header is not a security problem.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


@contextmanager
def _llm(cfg: LlmConfig | None, request: Request, *, needs_model: bool = True):
    """Bind the request's LLM credentials, enforcing the free-tier gate.

    Raises HTTPException so every endpoint gets identical, actionable errors:
      400 - the config itself is unusable (missing key, unknown provider)
      429 - the shared free key is saturated; the user should add their own

    `needs_model=False` marks a token-free path (e.g. recompute with client-supplied
    edges): missing credentials are tolerated and the free-tier gate is skipped, so a
    user with no key can still use the deterministic features.
    """
    ip = _client_ip(request)
    try:
        resolved = resolve(cfg, client_ip=ip)
    except LlmConfigError as e:
        if not needs_model:
            yield None
            return
        raise HTTPException(status_code=400, detail=str(e)) from e

    if needs_model and resolved.is_free_tier:
        try:
            free_tier.ensure_available(ip)
        except FreeTierBusy as e:
            raise HTTPException(status_code=429, detail=str(e)) from e

    with use_llm(resolved):
        yield resolved


#: A bad key or an unreachable model is the caller's problem, a saturated quota is
#: a 429, and anything else upstream is a bad gateway rather than our own crash.
_STATUS_BY_KIND = {"auth": 400, "client": 400, "quota": 429, "unknown": 502}


def _fail(e: Exception) -> HTTPException:
    """Normalize an agent/provider failure into a redacted HTTP error."""
    if isinstance(e, HTTPException):
        return e
    if isinstance(e, LlmCallError):
        return HTTPException(status_code=_STATUS_BY_KIND.get(e.kind, 502),
                             detail=redact(str(e)))
    return HTTPException(status_code=500, detail=redact(str(e)))


# --------------------------------------------------------------------------- #
# Meta endpoints
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health(request: Request):
    """Liveness plus whether the free shared engine can take this visitor now.

    The header's engine pill renders straight from this payload.
    """
    return {
        "status": "ok",
        "free_tier": free_tier.status(_client_ip(request)),
        "free_tier_provider": FREE_TIER_PROVIDER,
    }


@app.get("/api/llm/providers")
def llm_providers():
    """Catalog that drives the provider/model pickers in the engine settings dialog.

    Served from the backend so the two can never drift apart, and so model lists can
    be corrected by a redeploy without shipping a new frontend bundle.
    """
    return {"providers": catalog(), "free_tier_provider": FREE_TIER_PROVIDER}


@app.post("/api/llm/test")
def llm_test(req: LlmTestRequest, request: Request):
    """Verify a key with the smallest possible model call.

    The key is used in-process and discarded — it is never persisted or logged.
    A failure comes back as 200 with ok=false so the dialog can show the reason
    inline rather than treating it as a transport error.
    """
    with _llm(req.llm, request) as resolved:
        try:
            result = probe()
        except Exception as e:  # noqa: BLE001 - surfaced to the user as text
            return {"ok": False, "provider": resolved.provider, "model": resolved.model,
                    "message": redact(str(e))}
        return {
            "ok": True,
            "provider": resolved.provider,
            "model": result["model"],
            "latency_ms": result["latency_ms"],
            "supports_search": resolved.spec.supports_search,
            "message": f"Connected to {resolved.spec.label} · {result['model']} "
                       f"in {result['latency_ms']} ms.",
        }


# --------------------------------------------------------------------------- #
# Pipeline endpoints
# --------------------------------------------------------------------------- #

@app.post("/api/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Pull plain text out of an uploaded .pdf / .txt / .md file."""
    raw = await file.read()
    name = (file.filename or "").lower()
    try:
        if name.endswith(".pdf"):
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    return {"text": text.strip()}


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest, request: Request):
    """Run the pipeline, streaming each step as an SSE event."""
    doc = req.document.strip()
    if len(doc) < 30:
        raise HTTPException(status_code=400, detail="Document is too short to analyze.")

    # Validate credentials and the free-tier gate BEFORE the stream opens, so a bad
    # key is a clean 400/429 instead of an error event inside a 200 response.
    ip = _client_ip(request)
    try:
        resolved = resolve(req.llm, client_ip=ip)
    except LlmConfigError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if resolved.is_free_tier:
        try:
            free_tier.ensure_available(ip)
        except FreeTierBusy as e:
            raise HTTPException(status_code=429, detail=str(e)) from e

    def event_stream():
        # stream_with_llm re-binds the credentials around every step: Starlette pulls
        # each item in a fresh context, so a single enclosing `with` would leak the
        # binding after the first event. See llm_runtime.stream_with_llm.
        try:
            for event in stream_with_llm(resolved, run_pipeline(doc)):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            # Already redacted by stream_with_llm, which still had the secrets bound.
            payload = {"step": "error", "status": "error", "message": str(e)}
            yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/review")
def review(req: AnalysisRequest, request: Request):
    """On-demand AI architecture review / risk audit."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    with _llm(req.llm, request):
        try:
            return run_review(req.services, req.edges)
        except Exception as e:
            raise _fail(e) from e


@app.post("/api/roadmap")
def roadmap(req: AnalysisRequest, request: Request):
    """On-demand migration roadmap."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    with _llm(req.llm, request):
        try:
            return run_roadmap(req.services, req.edges)
        except Exception as e:
            raise _fail(e) from e


@app.post("/api/competitor")
def competitor(req: AnalysisRequest, request: Request):
    """On-demand competitor intelligence (live web search where supported)."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    with _llm(req.llm, request):
        try:
            return run_competitor(req.app_type, req.services)
        except Exception as e:
            raise _fail(e) from e


@app.post("/api/traceability")
def traceability(req: TraceabilityRequest, request: Request):
    """On-demand requirements→services traceability matrix (one LLM call)."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    with _llm(req.llm, request):
        try:
            return run_traceability(req.functional_areas, req.services)
        except Exception as e:
            raise _fail(e) from e


@app.post("/api/recompute")
def recompute_endpoint(req: RecomputeRequest, request: Request):
    """After the user edits services, recompute resilience (token-free when
    edges are supplied by the client)."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    # Only spends tokens when the client omits edges, so don't gate the free tier
    # on the common (free) path.
    with _llm(req.llm, request, needs_model=req.edges is None):
        try:
            return recompute(req.services, req.edges)
        except Exception as e:
            raise _fail(e) from e


@app.post("/api/apply-fix")
def apply_fix_endpoint(req: FixRequest, request: Request):
    """Apply an AI-suggested tradeoff fix, then recompute dependencies + resilience."""
    if not req.services or not req.instruction.strip():
        raise HTTPException(status_code=400, detail="services and instruction required.")
    with _llm(req.llm, request):
        try:
            return apply_fix(req.services, req.instruction)
        except Exception as e:
            raise _fail(e) from e
