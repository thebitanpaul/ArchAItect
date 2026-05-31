"""Tiny helpers to reduce tokens passed between agents.

Downstream agents (dependency, review, roadmap, refine) don't need the full
service objects — only enough to reason about boundaries and interactions.
Slimming the payload cuts input tokens on every one of those calls.
"""
import json


def slim_services(services: list[dict]) -> str:
    """Compact JSON with only the fields downstream agents actually use."""
    slim = [
        {
            "id": s.get("id"),
            "name": s.get("name"),
            "responsibility": s.get("responsibility"),
            "data_store": s.get("data_store"),
        }
        for s in services
    ]
    # No indentation = fewer tokens.
    return json.dumps(slim, separators=(",", ":"))


def slim_edges(edges: list[dict]) -> str:
    slim = [
        {"from": e.get("from"), "to": e.get("to"), "type": e.get("type")}
        for e in edges
    ]
    return json.dumps(slim, separators=(",", ":"))
