"""Agent — Migration Roadmap.

Produces a phased plan to build/migrate toward the proposed microservice
architecture (e.g. strangler-fig from a monolith, or greenfield build order).
Uses dependency ordering so foundational services come first.
"""
import json
from .llm_client import call_json

SYSTEM = """You are a staff engineer planning the delivery of a microservice
architecture. You sequence work pragmatically: foundational/low-dependency
services first (auth, catalog), revenue-critical paths next, analytics last.
You think in incremental, shippable phases using the strangler-fig pattern,
not a risky big-bang rewrite. Be concrete and realistic about ordering.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Given these services and their dependencies, produce a phased
delivery / migration roadmap (assume migrating from an existing monolith).

SERVICES:
{services}

DEPENDENCIES:
{edges}

Return JSON with EXACTLY this shape:
{{
  "approach": "1-2 sentences on the overall strategy (e.g. strangler-fig)",
  "phases": [
    {{
      "phase": 1,
      "name": "short phase name",
      "goal": "what this phase achieves",
      "services": ["service-id", ...],
      "milestone": "the demoable outcome at the end of this phase",
      "risk_note": "the main risk to watch in this phase"
    }}
  ]
}}

Produce 3-5 phases. Earlier phases should unblock later ones based on the
dependency graph. Every service must appear in exactly one phase."""


def run(services: dict, edges: list) -> dict:
    from ._payload import slim_services, slim_edges
    svc_list = services.get("services", services) if isinstance(services, dict) else services
    return call_json(
        SYSTEM,
        PROMPT.format(services=slim_services(svc_list), edges=slim_edges(edges)),
        max_tokens=3000,
    )
