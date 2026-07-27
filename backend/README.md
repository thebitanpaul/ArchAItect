# ArchAItect — Backend

Agentic microservice-identification pipeline. Provider-agnostic: the same agents run on
Gemini, Claude, GPT, AWS Bedrock, Groq, Mistral, OpenRouter, xAI, DeepSeek, or any
OpenAI-compatible endpoint. Which one is used is decided **per request** — either the
shared free key in this server's environment, or a key the visitor supplied from their
browser (see *Bring your own key* below).

## Pipeline (the "agentic" part)

```
doc -> [0 Condense: pure Python, 0 tokens]
         |
         v
       digest -> [1 Domain Extraction] -> [2 Decomposition] -> [3 Dependency Mapping]
                                                                      |
                 [5 Synthesis] <- [4 Competitor Intel (web search)] <--+
```

### Step 0 — token-free document condensation (`preprocess.py`)

Real requirements docs can be huge and messy. Sending the whole thing to the
LLM burns tokens and breaks on long files. So BEFORE any model call, we condense
the document in pure Python (no tokens, no API):

- strip boilerplate (page numbers, TOC, legal/version headers, dividers)
- score every sentence / heading / list-item by "requirement signal"
  (requirement keywords like *shall/must*, domain nouns, structural cues)
- deduplicate near-identical lines
- keep the highest-signal content up to a fixed character budget

The result is a bounded, information-dense digest that fits comfortably no
matter how large the input. The compression ratio is surfaced in the UI.

Each downstream agent is a focused model call with a strict JSON contract.
The orchestrator streams every step to the UI as Server-Sent Events.

## Bring your own key

Three modules, layered so that only the bottom one knows about vendors:

| Module | Responsibility |
|---|---|
| `llm_providers.py` | The provider catalog and one wire format per vendor family (`gemini`, `anthropic`, `openai`-compatible, `bedrock`). Returns raw text. |
| `llm_runtime.py` | Per-request credentials (`LlmConfig` → `ResolvedLlm`), the `ContextVar` binding, secret redaction, and the shared-key traffic gate. |
| `agents/llm_client.py` | Retry policy, model fallback, error classification, JSON extraction. What the agents actually import. |

An agent still just calls `call_json(system, user)` — it has no idea who the provider is.

**Credential lifetime.** A request body may carry an `llm` object. It's validated into a
`ResolvedLlm`, bound to a `ContextVar` for the duration of that request, and discarded.
Nothing is logged or written to disk, and `redact()` strips secrets out of provider error
messages before they leave the process.

> **Streaming gotcha.** Starlette pulls each item of a sync generator in its own
> threadpool context, so a `ContextVar` set inside the generator body does *not* survive to
> the next `next()`. `/api/analyze` therefore uses `llm_runtime.stream_with_llm`, which
> re-binds the credentials around every step. Without it only the first pipeline step would
> see the visitor's key and the rest would silently fall back to the server's.

**Free-tier gate.** When a request omits `llm` (or sends `provider: "phiuture"`), the
server's own `GEMINI_API_KEY` is used, metered by three in-memory rolling windows —
global hourly, global daily, and per-visitor hourly. Exhaustion returns **429** with a
message pointing the user at the BYO dialog. It's fair-use protection for a shared key,
not billing, so per-instance state is deliberate.

## Setup (run from the `backend/` folder)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

Health check: http://localhost:8000/api/health

### Environment (`backend/.env`, all optional)

```env
GEMINI_API_KEY=AIza...        # powers the free phiUture engine — https://aistudio.google.com/apikey
MODEL=gemini-2.5-flash        # model for the free engine
FALLBACK_MODEL=gemini-2.5-flash-lite
CORS_ORIGINS=http://localhost:5173
FREE_TIER_HOURLY_LIMIT=150    # shared-key calls/hour across all visitors
FREE_TIER_DAILY_LIMIT=900     # shared-key calls/day
FREE_TIER_IP_HOURLY_LIMIT=18  # shared-key calls/hour per visitor
```

Without `GEMINI_API_KEY` the server starts normally — the free engine just reports itself
as unconfigured and visitors supply their own key.

> **Windows note:** make sure the file is named exactly `.env` and not `.env.txt`, and
> don't put quotes around the key.

## Endpoints

Every endpoint that can spend tokens accepts an optional `llm` object:
`{provider, model?, api_key?, api_secret?, session_token?, region?, base_url?}`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + live free-tier availability (drives the header pill). |
| GET | `/api/llm/providers` | Provider/model catalog for the engine dialog. |
| POST | `/api/llm/test` | Smoke-test a key with the smallest possible call. Nothing is stored. |
| POST | `/api/extract-text` | Multipart `.pdf`/`.txt`/`.md` upload → `{"text": "..."}`. |
| POST | `/api/analyze` | `{document, llm?}` → SSE stream of step events, ending with `result`. |
| POST | `/api/review` | Risk audit (on demand). |
| POST | `/api/traceability` | Requirements → services matrix (on demand). |
| POST | `/api/roadmap` | Migration roadmap (on demand). |
| POST | `/api/competitor` | Competitor intel, web-grounded where the provider supports it. |
| POST | `/api/recompute` | Resilience + metrics. Token-free when `edges` are supplied. |
| POST | `/api/apply-fix` | Apply an AI-suggested tradeoff, then recompute. |

**Status codes** are chosen so a bad key doesn't look like a server crash: `400` for a
rejected key / unusable config / unreachable model, `429` for provider quota or an
exhausted free tier, `502` for anything else upstream, `500` only for our own faults.

## Provider notes

- **Web search** — only Gemini (Google Search grounding) and Claude (web-search tool) can
  research live. Other providers still answer the competitor prompt, but are explicitly
  instructed to label their sources as public knowledge rather than a live lookup, and the
  response carries `grounded: false`.
- **JSON output** — Gemini uses `response_mime_type`, OpenAI-compatible providers use
  `response_format`, Claude uses an assistant prefill. Bedrock has none of these and relies
  on prompt instruction plus the client's fenced-block extraction.
- **Reasoning models** that reject `max_tokens` or a custom `temperature` are handled by
  reacting to the provider's own complaint and retrying once without the offending
  parameter, rather than maintaining a capability table that goes stale.
- **Model IDs** in the catalog are suggestions. The UI accepts any model string, so a
  renamed model never blocks a user.
