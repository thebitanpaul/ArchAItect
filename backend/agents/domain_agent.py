"""Agent 1 — Domain Extraction.
Reads the raw requirements doc and pulls out the structured domain model:
functional areas, business entities, actors, and the core capabilities.
"""
from .llm_client import call_json

SYSTEM = """You are a senior domain analyst doing Domain-Driven Design discovery.
You read software requirements and extract the underlying domain model.
You are precise and never invent requirements that aren't implied by the text.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Analyze the requirements document below and extract its domain model.

Return JSON with EXACTLY this shape:
{{
  "app_type": "short label, e.g. 'E-commerce platform'",
  "summary": "2-3 sentence plain-English summary of what the system does",
  "actors": ["list of user roles / external actors"],
  "functional_areas": [
    {{"name": "area name", "description": "what this area covers", "capabilities": ["capability 1", "capability 2"]}}
  ],
  "entities": [
    {{"name": "EntityName", "description": "what it represents", "key_attributes": ["attr1", "attr2"]}}
  ]
}}

Keep it focused: at most 8 functional_areas and 12 entities — merge closely
related items rather than listing every minor detail. Capture the core domain,
not an exhaustive inventory.

REQUIREMENTS (a condensed, high-signal digest of the source document):
\"\"\"
{doc}
\"\"\""""


def run(doc: str) -> dict:
    return call_json(SYSTEM, PROMPT.format(doc=doc), max_tokens=3000)
