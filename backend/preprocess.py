"""Token-free document preprocessing.

The goal: take ANY requirements document — structured or messy, short or
hundreds of pages — and distill it into a compact, information-dense digest
BEFORE it ever reaches the LLM. This runs entirely in Python (no tokens, no
API calls), so it costs nothing and never hits a rate limit.

Strategy (classic extractive summarization, no ML):
  1. Normalize and split the document into lines / sentences.
  2. Drop boilerplate noise (page numbers, TOC dot-leaders, revision tables,
     legal disclaimers, repeated headers/footers).
  3. Score each unit by how much "requirement signal" it carries
     (requirement keywords, action verbs, domain nouns, structural cues).
  4. Deduplicate near-identical lines.
  5. Keep the highest-signal content up to a character budget.

This preserves the domain-rich sentences the LLM needs while throwing away
the filler that bloats token usage and breaks long-document runs.
"""
import re
from collections import OrderedDict

# Words that strongly indicate a functional requirement / domain statement.
_REQUIREMENT_WORDS = {
    "shall", "must", "should", "will", "needs", "need", "require", "required",
    "able", "allow", "allows", "enable", "enables", "support", "supports",
    "manage", "manages", "create", "process", "handle", "handles", "track",
    "tracks", "generate", "view", "update", "delete", "add", "submit",
    "approve", "send", "receive", "store", "search", "filter", "assign",
    "notify", "validate", "authenticate", "authorize", "calculate", "report",
    "upload", "download", "schedule", "integrate", "sync", "export", "import",
}

# Domain-y nouns that hint at actors/entities/areas.
_DOMAIN_WORDS = {
    "user", "users", "customer", "customers", "admin", "administrator",
    "system", "service", "services", "order", "orders", "payment", "payments",
    "product", "products", "account", "accounts", "inventory", "cart",
    "invoice", "notification", "notifications", "dashboard", "role", "roles",
    "permission", "permissions", "data", "record", "records", "transaction",
    "report", "reports", "api", "module", "feature", "workflow", "request",
    "profile", "subscription", "delivery", "shipment", "catalog", "booking",
    "appointment", "message", "review", "rating", "wishlist", "refund",
}

# Lines matching these are almost always noise.
_NOISE_PATTERNS = [
    re.compile(r"^\s*page\s+\d+", re.I),
    re.compile(r"^\s*\d+\s*$"),                       # bare page numbers
    re.compile(r"^\s*table of contents\s*$", re.I),
    re.compile(r"\.{4,}\s*\d+\s*$"),                  # TOC dot leaders "... 12"
    re.compile(r"^\s*(confidential|copyright|©|\(c\))", re.I),
    re.compile(r"^\s*(version|revision|rev\.?|doc(ument)? id)\s*[:#]", re.I),
    re.compile(r"^\s*(prepared by|approved by|date|author)\s*:", re.I),
    re.compile(r"^[\s\-=_*#~]+$"),                    # divider lines
]

_HEADER_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+)$")    # markdown headers
_LIST_RE = re.compile(r"^\s*([-*+]|\d+[.)])\s+(.+)$") # bullets / numbered
_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z']+")


def _is_noise(line: str) -> bool:
    if len(line.strip()) < 3:
        return True
    return any(p.search(line) for p in _NOISE_PATTERNS)


def _split_sentences(text: str) -> list[str]:
    """Lightweight sentence splitter (no nltk dependency)."""
    # Split on sentence enders followed by space + capital, keep it simple.
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _score(unit: str, is_header: bool, is_list: bool) -> float:
    words = [w.lower() for w in _WORD_RE.findall(unit)]
    if not words:
        return 0.0
    req = sum(1 for w in words if w in _REQUIREMENT_WORDS)
    dom = sum(1 for w in words if w in _DOMAIN_WORDS)

    score = req * 3.0 + dom * 1.5

    # structural cues: headers name functional areas; list items are often
    # discrete requirements — both are high-signal.
    if is_header:
        score += 4.0
    if is_list:
        score += 1.5

    # mild length normalization: reward substance, penalize rambling
    n = len(words)
    if n < 4:
        score *= 0.5
    elif n > 45:
        score *= 0.7

    # density bonus: signal per word
    score += (req + dom) / max(n, 1) * 2.0
    return score


def _dedupe(units: list[str]) -> list[str]:
    seen: "OrderedDict[str, str]" = OrderedDict()
    for u in units:
        key = re.sub(r"\s+", " ", u.lower()).strip()[:120]
        if key not in seen:
            seen[key] = u
    return list(seen.values())


def condense(text: str, char_budget: int = 6000) -> dict:
    """Condense a document into a high-signal digest.

    Returns a dict with the digest plus some cheap stats we can surface in the
    UI to show the optimization is real ("compressed 48,000 -> 5,800 chars").
    """
    original_len = len(text)

    # If it's already short, skip the work entirely — no point condensing.
    if original_len <= char_budget:
        return {
            "digest": text.strip(),
            "original_chars": original_len,
            "digest_chars": len(text.strip()),
            "compressed": False,
        }

    raw_lines = text.splitlines()

    # Build scored units. Headers and list items are kept as-is; long prose
    # paragraphs are broken into sentences so we can cherry-pick the dense ones.
    scored: list[tuple[float, str]] = []
    for line in raw_lines:
        if _is_noise(line):
            continue

        h = _HEADER_RE.match(line)
        if h:
            txt = h.group(1).strip()
            scored.append((_score(txt, True, False) + 1.0, f"## {txt}"))
            continue

        lm = _LIST_RE.match(line)
        if lm:
            txt = lm.group(2).strip()
            scored.append((_score(txt, False, True), f"- {txt}"))
            continue

        # prose line: split into sentences and score each
        for sent in _split_sentences(line):
            scored.append((_score(sent, False, False), sent))

    if not scored:
        # fallback: nothing scored (weird doc) — just hard-truncate.
        return {
            "digest": text.strip()[:char_budget],
            "original_chars": original_len,
            "digest_chars": min(char_budget, original_len),
            "compressed": True,
        }

    # Rank by score, keep top units until we hit the budget, then restore the
    # ORIGINAL reading order so the digest still reads coherently.
    indexed = list(enumerate(scored))
    indexed.sort(key=lambda x: x[1][0], reverse=True)

    chosen_idx: set[int] = set()
    used = 0
    for orig_i, (_, unit) in indexed:
        if used + len(unit) > char_budget:
            continue
        chosen_idx.add(orig_i)
        used += len(unit) + 1
        if used >= char_budget:
            break

    ordered = [scored[i][1] for i in range(len(scored)) if i in chosen_idx]
    digest = _dedupe(ordered)
    digest_text = "\n".join(digest).strip()

    return {
        "digest": digest_text,
        "original_chars": original_len,
        "digest_chars": len(digest_text),
        "compressed": True,
    }
