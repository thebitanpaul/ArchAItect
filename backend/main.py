"""FastAPI app — exposes the agentic pipeline over HTTP.

Endpoints:
  POST /api/extract-text   -> extract text from an uploaded file (pdf/txt/md)
  POST /api/analyze        -> stream the pipeline as Server-Sent Events (SSE)
"""
import json
import io
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader

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


class AnalyzeRequest(BaseModel):
    document: str


class AnalysisRequest(BaseModel):
    services: list
    edges: list = []
    app_type: str = "software system"


class RecomputeRequest(BaseModel):
    services: list
    edges: list | None = None


class FixRequest(BaseModel):
    services: list
    instruction: str


class TraceabilityRequest(BaseModel):
    functional_areas: list
    services: list


@app.get("/api/health")
def health():
    return {"status": "ok"}


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
def analyze(req: AnalyzeRequest):
    """Run the pipeline, streaming each step as an SSE event."""
    doc = req.document.strip()
    if len(doc) < 30:
        raise HTTPException(status_code=400, detail="Document is too short to analyze.")

    def event_stream():
        try:
            for event in run_pipeline(doc):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step': 'error', 'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/review")
def review(req: AnalysisRequest):
    """On-demand AI architecture review / risk audit."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    try:
        return run_review(req.services, req.edges)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/roadmap")
def roadmap(req: AnalysisRequest):
    """On-demand migration roadmap."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    try:
        return run_roadmap(req.services, req.edges)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/competitor")
def competitor(req: AnalysisRequest):
    """On-demand competitor intelligence (live web search)."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    try:
        return run_competitor(req.app_type, req.services)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/traceability")
def traceability(req: TraceabilityRequest):
    """On-demand requirements→services traceability matrix (one LLM call)."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    try:
        return run_traceability(req.functional_areas, req.services)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/recompute")
def recompute_endpoint(req: RecomputeRequest):
    """After the user edits services, recompute resilience (token-free when
    edges are supplied by the client)."""
    if not req.services:
        raise HTTPException(status_code=400, detail="services required.")
    try:
        return recompute(req.services, req.edges)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/apply-fix")
def apply_fix_endpoint(req: FixRequest):
    """Apply an AI-suggested tradeoff fix, then recompute dependencies + resilience."""
    if not req.services or not req.instruction.strip():
        raise HTTPException(status_code=400, detail="services and instruction required.")
    try:
        return apply_fix(req.services, req.instruction)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
