"""Orchestrator — runs the agent pipeline and yields progress events.

Design: the base pipeline produces ONLY the service map (domain -> decompose
-> dependencies -> resilience). The expensive LLM analyses (review, roadmap,
competitor) are NOT run automatically — they're exposed as separate on-demand
functions so the user only spends tokens on what they ask for.

Resilience is pure Python (zero tokens), so it's always computed with the map.
"""
from agents import (
    domain_agent, decompose_agent, dependency_agent, competitor_agent,
    review_agent, roadmap_agent, refine_agent, traceability_agent,
)
from preprocess import condense
from resilience import analyze as analyze_resilience
from metrics import analyze as analyze_metrics

# Steps shown in the live pipeline console (map generation only).
STEPS = [
    ("domain", "Extracting domain model"),
    ("decompose", "Identifying microservice boundaries"),
    ("dependencies", "Mapping service dependencies"),
    ("synthesis", "Assembling the service map"),
]


def run_pipeline(doc: str):
    """Base pipeline: produce the service map. Yields SSE step events."""
    result = {}

    # 0. Token-free condensation BEFORE any LLM call.
    # Token-free condensation. 3500 chars (~900 tokens) is plenty of signal for
    # domain extraction while keeping input cost low — the digest is the only
    # raw text any LLM sees in the whole pipeline.
    condensed = condense(doc, char_budget=3500)
    digest = condensed["digest"]
    yield {"step": "preprocess", "status": "done", "data": {
        "original_chars": condensed["original_chars"],
        "digest_chars": condensed["digest_chars"],
        "compressed": condensed["compressed"],
    }}

    # 1. Domain
    yield {"step": "domain", "label": "Extracting domain model", "status": "running"}
    domain = domain_agent.run(digest)
    yield {"step": "domain", "status": "done", "data": domain}

    # 2. Decompose
    yield {"step": "decompose", "label": "Identifying microservice boundaries", "status": "running"}
    decomp = decompose_agent.run(domain)
    result["services"] = decomp.get("services", [])
    yield {"step": "decompose", "status": "done", "data": decomp}

    # 3. Dependencies
    yield {"step": "dependencies", "label": "Mapping service dependencies", "status": "running"}
    deps = dependency_agent.run(decomp)
    result["edges"] = deps.get("edges", [])
    result["shared_concerns"] = deps.get("shared_concerns", [])
    yield {"step": "dependencies", "status": "done", "data": deps}

    # 3b. Resilience + Metrics — both free Python, always included with the map.
    resilience = analyze_resilience(result["services"], result["edges"])
    metrics = analyze_metrics(result["services"], result["edges"])

    # 4. Synthesis (map-only payload; LLM analyses are fetched on demand)
    yield {"step": "synthesis", "label": "Assembling the service map", "status": "running"}
    final = {
        "app_type": domain.get("app_type"),
        "summary": domain.get("summary"),
        "actors": domain.get("actors", []),
        "functional_areas": domain.get("functional_areas", []),
        "services": result["services"],
        "edges": result["edges"],
        "shared_concerns": result["shared_concerns"],
        "resilience": resilience,
        "metrics": metrics,
        "preprocess": {
            "original_chars": condensed["original_chars"],
            "digest_chars": condensed["digest_chars"],
            "compressed": condensed["compressed"],
        },
    }
    yield {"step": "synthesis", "status": "done", "data": final}
    yield {"step": "result", "status": "complete", "data": final}


# ---- On-demand analyses (each its own endpoint; spends tokens only when asked) ----

def run_review(services: list, edges: list) -> dict:
    return review_agent.run({"services": services}, edges)


def run_roadmap(services: list, edges: list) -> dict:
    return roadmap_agent.run({"services": services}, edges)


def run_competitor(app_type: str, services: list) -> dict:
    names = [s.get("name", "") for s in services]
    return competitor_agent.run(app_type, names)


def run_traceability(functional_areas: list, services: list) -> dict:
    return traceability_agent.run(functional_areas, services)


def recompute(services: list, edges: list | None = None) -> dict:
    """After the user edits services, recompute resilience + metrics. TOKEN-FREE
    when edges are supplied (the user defined their own connections); only falls
    back to the LLM dependency agent if no edges are passed.
    """
    if edges is None:
        decomp = {"services": services}
        deps = dependency_agent.run(decomp)
        edges = deps.get("edges", [])
        shared = deps.get("shared_concerns", [])
    else:
        shared = None  # client keeps its existing shared_concerns
    resilience = analyze_resilience(services, edges)
    metrics = analyze_metrics(services, edges)
    out = {"edges": edges, "resilience": resilience, "metrics": metrics}
    if shared is not None:
        out["shared_concerns"] = shared
    return out


def apply_fix(services: list, instruction: str) -> dict:
    """Apply an AI-suggested tradeoff fix, then recompute dependencies +
    resilience. Review is NOT re-run automatically (on-demand)."""
    refined = refine_agent.run(services, instruction)
    new_services = refined.get("services", services)
    recomputed = recompute(new_services)
    return {
        "services": new_services,
        "change_note": refined.get("change_note", ""),
        **recomputed,
    }
