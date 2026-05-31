"""Resilience analysis — pure Python, ZERO tokens.

Computes the "blast radius" of each service: if it goes down, which other
services are impacted? This models a real architectural truth:

  - SYNCHRONOUS dependencies propagate failure. If A synchronously calls B and
    B is down, A is impaired (and whatever synchronously depends on A, etc.).
  - ASYNCHRONOUS (event/queue) dependencies do NOT propagate failure the same
    way — that's the entire reason we decouple with queues. Events buffer.

So blast radius = transitive closure over the reverse of the sync-edge graph.

Also derives:
  - criticality ranking (which services take down the most if they fail)
  - single points of failure (high blast radius)
  - resilience score for the whole system
"""
from collections import defaultdict, deque


def analyze(services: list[dict], edges: list[dict]) -> dict:
    ids = [s["id"] for s in services]
    name_of = {s["id"]: s.get("name", s["id"]) for s in services}

    # Build reverse sync-dependency graph: if X depends (sync) on Y, then a
    # failure of Y impacts X. So we add edge Y -> X in the "impact" graph.
    impact = defaultdict(set)
    for e in edges:
        if e.get("type") == "sync":
            frm, to = e.get("from"), e.get("to")
            if frm in name_of and to in name_of:
                impact[to].add(frm)

    def blast_radius(start: str) -> list[str]:
        """All services transitively impacted if `start` fails (sync only)."""
        seen: set[str] = set()
        q = deque([start])
        while q:
            cur = q.popleft()
            for nxt in impact.get(cur, ()):
                if nxt not in seen and nxt != start:
                    seen.add(nxt)
                    q.append(nxt)
        return sorted(seen)

    per_service = {}
    for sid in ids:
        radius = blast_radius(sid)
        per_service[sid] = {
            "id": sid,
            "name": name_of[sid],
            "impacts": radius,
            "impact_count": len(radius),
        }

    # Criticality ranking (most damaging failures first).
    ranking = sorted(per_service.values(), key=lambda x: x["impact_count"], reverse=True)

    total = len(ids)
    # Single points of failure: a failure that impacts >=30% of the system.
    spofs = [s for s in ranking if total and s["impact_count"] / total >= 0.30 and s["impact_count"] > 0]

    # Resilience score: higher when failures stay contained. Penalize large
    # average blast radius and the presence of SPOFs.
    if total > 1:
        avg_radius = sum(s["impact_count"] for s in ranking) / total
        contained = 1 - (avg_radius / (total - 1))  # 1.0 = perfectly isolated
        spof_penalty = min(len(spofs) * 0.12, 0.5)
        score = max(0, min(100, round((contained - spof_penalty) * 100)))
    else:
        score = 100

    return {
        "resilience_score": score,
        "per_service": per_service,        # id -> {impacts, impact_count}
        "ranking": ranking,                # sorted most-critical first
        "single_points_of_failure": [s["id"] for s in spofs],
        "total_services": total,
    }
