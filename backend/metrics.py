"""Architecture metrics — pure Python, ZERO tokens.

Derives well-known software-architecture metrics from the services + dependency
graph we already have. No LLM call. Each metric maps to a classic definition:

  - Cohesion: how focused a service is (does it do ONE thing?). Approximated by
    how few entities it owns and how tight its API surface is. High cohesion = good.
  - Coupling (fan-in / fan-out): how many services depend ON it (afferent) and
    how many it depends on (efferent). Lower coupling = cleaner boundaries.
  - Business boundary quality: a blend — a service with a clear single bounded
    context, high cohesion, and low coupling has a well-drawn boundary.
  - Scalability: how easily a service scales independently. Driven by data-store
    type (stateless/cache scales easily; transactional SQL is harder), inbound
    load (fan-in), and whether it sits on a synchronous hot path.
  - DDD view: bounded context + aggregate root (the entity a service owns) +
    ubiquitous-language terms, surfaced per service.
"""
from collections import defaultdict


def _store_scalability(store: str) -> tuple[int, str]:
    """Return (0-100 ease score, note) for scaling a service on this store."""
    s = (store or "").lower()
    if any(k in s for k in ("redis", "cache", "memcached")):
        return 95, "in-memory/stateless — scales horizontally with ease"
    if any(k in s for k in ("object", "s3", "blob")):
        return 92, "object storage — effectively unlimited, scales transparently"
    if any(k in s for k in ("elastic", "opensearch", "search")):
        return 80, "search cluster — scales by adding shards/replicas"
    if any(k in s for k in ("mongo", "document", "nosql", "cassandra", "dynamo")):
        return 82, "NoSQL — horizontal sharding is straightforward"
    if any(k in s for k in ("kafka", "event", "stream", "queue")):
        return 85, "log/stream — partitions scale throughput linearly"
    if any(k in s for k in ("warehouse", "bigquery", "redshift", "analytic")):
        return 70, "analytical store — scales for reads, batch-oriented"
    if any(k in s for k in ("postgres", "mysql", "sql", "relational", "maria")):
        return 55, "relational — vertical first; horizontal needs sharding/replicas"
    if any(k in s for k in ("neo4j", "graph")):
        return 45, "graph DB — harder to shard; scale-up preferred"
    return 60, "general store — moderate scaling effort"


def analyze(services: list[dict], edges: list[dict]) -> dict:
    ids = [s["id"] for s in services]
    name_of = {s["id"]: s.get("name", s["id"]) for s in services}

    fan_in = defaultdict(int)   # afferent coupling: who depends ON me
    fan_out = defaultdict(int)  # efferent coupling: who I depend ON
    sync_in = defaultdict(int)  # synchronous inbound (load on the hot path)
    for e in edges:
        f, t = e.get("from"), e.get("to")
        if f in name_of and t in name_of:
            fan_out[f] += 1
            fan_in[t] += 1
            if e.get("type") == "sync":
                sync_in[t] += 1

    per_service = {}
    cohesion_vals, coupling_vals, scale_vals, boundary_vals = [], [], [], []

    for s in services:
        sid = s["id"]
        entities = s.get("owns_entities", []) or []
        apis = s.get("key_apis", []) or []

        # --- Cohesion: fewer owned entities + tight API surface = more focused.
        # 1 entity is ideal (single aggregate). Penalize sprawl.
        ent_n = max(len(entities), 1)
        cohesion = 100
        if ent_n == 1:
            cohesion = 95
        elif ent_n == 2:
            cohesion = 80
        elif ent_n == 3:
            cohesion = 65
        else:
            cohesion = max(40, 95 - (ent_n - 1) * 12)
        if len(apis) > 8:  # very broad API surface hints at doing too much
            cohesion = max(35, cohesion - 15)
        cohesion = int(cohesion)

        # --- Coupling: total fan-in + fan-out. Normalize to a 0-100 "looseness".
        total_coupling = fan_in[sid] + fan_out[sid]
        n = max(len(ids) - 1, 1)
        looseness = int(max(0, 100 - (total_coupling / n) * 60))

        # --- Scalability: blend store ease, with a penalty for heavy sync fan-in
        # (a hot synchronous dependency is harder to scale independently).
        store_ease, store_note = _store_scalability(s.get("data_store", ""))
        sync_penalty = min(sync_in[sid] * 8, 30)
        scalability = int(max(20, store_ease - sync_penalty))

        # --- Business boundary quality: cohesive + loosely coupled + owns a
        # clear context = a well-drawn boundary.
        boundary = int(round(0.45 * cohesion + 0.4 * looseness + 15 * (1 if entities else 0.4)))
        boundary = max(0, min(100, boundary))

        per_service[sid] = {
            "id": sid,
            "name": name_of[sid],
            "bounded_context": s.get("bounded_context", "—"),
            "aggregate_root": entities[0] if entities else "—",
            "owns_entities": entities,
            "cohesion": cohesion,
            "fan_in": fan_in[sid],
            "fan_out": fan_out[sid],
            "coupling_looseness": looseness,
            "scalability": scalability,
            "scalability_note": store_note,
            "sync_inbound": sync_in[sid],
            "boundary_quality": boundary,
        }
        cohesion_vals.append(cohesion)
        coupling_vals.append(looseness)
        scale_vals.append(scalability)
        boundary_vals.append(boundary)

    def avg(xs):
        return int(round(sum(xs) / len(xs))) if xs else 0

    ranking = sorted(per_service.values(), key=lambda x: x["boundary_quality"], reverse=True)

    return {
        "per_service": per_service,
        "ranking": ranking,
        "summary": {
            "avg_cohesion": avg(cohesion_vals),
            "avg_coupling_looseness": avg(coupling_vals),
            "avg_scalability": avg(scale_vals),
            "avg_boundary_quality": avg(boundary_vals),
        },
        # bounded contexts list for the DDD view
        "bounded_contexts": sorted({s.get("bounded_context", "—") for s in services}),
        "total_services": len(ids),
    }
