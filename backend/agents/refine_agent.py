"""Agent — Interactive Refinement.

Takes the current set of services plus a user instruction (often a fix
suggested by the review agent, e.g. "split the God service X into focused
services") and returns a REVISED set of services. The orchestrator then
recomputes dependencies / resilience / review on the new design.

This is what turns the tool from a one-shot analyzer into an AI architect
you collaborate with.
"""
import json
from .llm_client import call_json

SYSTEM = """You are a principal architect refining a microservice design based
on a specific instruction. You make the requested change surgically: keep
unaffected services exactly as they are, and only add/split/merge/modify what
the instruction implies. Preserve the JSON shape of each service.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Here is the current set of services:
{services}

Apply this change:
"{instruction}"

Return JSON with EXACTLY this shape (the COMPLETE revised service list):
{{
  "services": [
    {{
      "id": "kebab-case-id",
      "name": "Human Readable Name",
      "responsibility": "single clear sentence",
      "bounded_context": "DDD bounded context",
      "owns_entities": ["..."],
      "key_apis": ["GET /x"],
      "data_store": "e.g. PostgreSQL",
      "rationale": "why this service exists"
    }}
  ],
  "change_note": "1 sentence describing what you changed"
}}

Keep all services that aren't affected by the instruction unchanged. Ensure
every entity is still owned by exactly one service."""


def run(services: list[dict], instruction: str) -> dict:
    return call_json(
        SYSTEM,
        PROMPT.format(services=json.dumps(services, indent=2), instruction=instruction),
        max_tokens=8000,
    )
