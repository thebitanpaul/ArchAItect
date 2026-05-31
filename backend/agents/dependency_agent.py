"""Agent 3 — Dependency Mapping.
Builds the directed dependency graph between services and recommends the
communication style (sync REST/gRPC vs async events) for each edge.
"""
import json
from .llm_client import call_json

SYSTEM = """You are a distributed-systems architect. Given a set of microservices,
you determine how they must interact. You prefer asynchronous events for
cross-domain workflows to reduce coupling, and synchronous calls only where a
caller genuinely needs an immediate response.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Given these services, map their dependencies.

SERVICES:
{services}

Return JSON with EXACTLY this shape:
{{
  "edges": [
    {{
      "from": "service-id-that-initiates",
      "to": "service-id-it-depends-on",
      "type": "sync" or "async",
      "protocol": "REST" | "gRPC" | "Event/Message Queue",
      "reason": "what data/action flows and why this style"
    }}
  ],
  "shared_concerns": ["cross-cutting concerns like 'API Gateway', 'Auth', 'Observability'"]
}}

Only include real dependencies implied by the responsibilities. Avoid cycles where possible."""


def run(services: dict) -> dict:
    from ._payload import slim_services
    svc_list = services.get("services", services) if isinstance(services, dict) else services
    return call_json(SYSTEM, PROMPT.format(services=slim_services(svc_list)), max_tokens=2500)
