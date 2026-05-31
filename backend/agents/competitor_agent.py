"""Agent 4 — Competitor Intelligence.
Uses Claude's web_search tool to find how a real, well-known company in the
same domain actually architects their system. This is the differentiator:
real engineering-blog-grounded comparison, not made up.
"""
from .llm_client import call_json_with_search

SYSTEM = """You are a software architecture researcher. You search the web for
public information (engineering blogs, conference talks, tech docs) about how
well-known companies build their backend systems. You ONLY report architecture
details that you found in search results. If you can't confirm something, you
say it's a general industry pattern rather than claiming a specific company does it."""

PROMPT = """The user is building this kind of system: {app_type}

1. Identify ONE well-known company that operates a system in this same domain
   (e.g. for e-commerce -> Amazon; for streaming -> Netflix; for ride-hail -> Uber).
2. Search the web for how that company structures their microservices/backend.
3. Compare it to these proposed services: {service_names}

Then describe (for the final JSON, which a later step will format) a JSON object
with EXACTLY this shape:
{{
  "competitor": "Company name",
  "why_relevant": "one sentence on why they're a good comparison",
  "known_services": [
    {{"name": "their service/system name", "purpose": "what it does", "source_hint": "where this is publicly known from"}}
  ],
  "insights": ["2-4 actionable takeaways comparing their approach to the user's proposed services"]
}}

Base everything on what you actually find in search. Keep known_services to 4-7 items."""


def run(app_type: str, service_names: list[str]) -> dict:
    user = PROMPT.format(app_type=app_type, service_names=", ".join(service_names))
    try:
        return call_json_with_search(SYSTEM, user, max_tokens=2500)
    except Exception as e:
        # Never let the competitor step kill the whole run — it's a bonus feature
        return {
            "competitor": "Unavailable",
            "why_relevant": f"Competitor research could not complete ({type(e).__name__}).",
            "known_services": [],
            "insights": [],
        }
