"""Agent — Architecture Review & Risk Audit.

This is the "thinks like a senior architect" agent. It critiques the
architecture the pipeline just produced: scores it, and flags concrete,
well-known architectural risks tied to SPECIFIC services so the UI can
highlight them on the map.

It reuses the services + edges already computed — no re-reading the document.
"""
import json
from .llm_client import call_json

SYSTEM = """You are a principal software architect conducting a design review.
You evaluate a proposed microservice architecture for real, well-known risks:
- God service: one service with too many responsibilities / owned entities.
- Chatty synchronous chains: long chains of sync calls that cause cascading
  failures and latency amplification.
- Circular dependencies between services.
- Single point of failure: a service many others synchronously depend on.
- Distributed monolith: services so coupled they must deploy together.
- Missing resilience: critical sync paths with no async/queue fallback.
- Data consistency risk: workflows spanning multiple services' data.
You are specific and fair — cite the actual service ids. You do not invent
problems that aren't supported by the given services/edges.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Review this microservice architecture and produce a risk audit.

SERVICES:
{services}

DEPENDENCIES (edges):
{edges}

Return JSON with EXACTLY this shape:
{{
  "score": 0-100 integer (overall architectural health; be discerning, not generous),
  "grade": "A" | "B" | "C" | "D",
  "summary": "2-3 sentence honest assessment",
  "risks": [
    {{
      "id": "kebab-id",
      "severity": "high" | "medium" | "low",
      "category": "God Service" | "Chatty Sync Chain" | "Circular Dependency" | "Single Point of Failure" | "Distributed Monolith" | "Missing Resilience" | "Data Consistency",
      "title": "short risk title",
      "affected_services": ["service-id", ...],
      "explanation": "why this is a risk here, specifically",
      "recommendation": "concrete fix"
    }}
  ],
  "strengths": ["2-3 things the design does well"]
}}

Order risks by severity (high first). If the architecture is genuinely solid,
it's fine to return few or low-severity risks — don't fabricate."""


def run(services: dict, edges: list) -> dict:
    from ._payload import slim_services, slim_edges
    svc_list = services.get("services", services) if isinstance(services, dict) else services
    return call_json(
        SYSTEM,
        PROMPT.format(services=slim_services(svc_list), edges=slim_edges(edges)),
        max_tokens=3000,
    )
