"""Agent — Traceability Matrix.

Maps each functional requirement (functional areas + their capabilities, from
the domain model) to the service(s) that satisfy it. This is the classic
requirements-traceability artifact: it proves every requirement is covered and
surfaces gaps (a requirement no service owns) or overlaps.

One cheap LLM call: semantic matching is far better than keyword overlap here,
and the payload is small (we pass only slim names, not full objects).
"""
import json
from .llm_client import call_json

SYSTEM = """You are a requirements engineer building a traceability matrix.
You map each functional requirement to the microservice(s) responsible for it.
Every requirement should trace to at least one service; flag any that can't
(a coverage gap). Be precise — only map where a service genuinely satisfies it.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Map these requirements to the services that satisfy them.

FUNCTIONAL AREAS & CAPABILITIES (the requirements):
{requirements}

SERVICES:
{services}

Return JSON with EXACTLY this shape:
{{
  "rows": [
    {{
      "requirement": "the capability / requirement text",
      "area": "its functional area",
      "service_ids": ["service-id", ...],
      "coverage": "covered" | "partial" | "gap"
    }}
  ],
  "coverage_pct": 0-100 integer (share of requirements with >=1 mapped service),
  "gaps": ["requirements with no owning service, if any"]
}}

Keep one row per capability. Use the service ids exactly as given."""


def run(functional_areas: list, services: list) -> dict:
    # Build a compact requirements list (area + capabilities) and slim services.
    reqs = []
    for fa in functional_areas:
        area = fa.get("name", "")
        for cap in fa.get("capabilities", []) or []:
            reqs.append({"area": area, "capability": cap})
    slim_services = [
        {"id": s.get("id"), "name": s.get("name"), "responsibility": s.get("responsibility")}
        for s in services
    ]
    return call_json(
        SYSTEM,
        PROMPT.format(
            requirements=json.dumps(reqs, separators=(",", ":")),
            services=json.dumps(slim_services, separators=(",", ":")),
        ),
        max_tokens=3500,
    )
