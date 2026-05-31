# ArchAItect — Backend

Agentic microservice-identification pipeline. Originally designed for the Claude
API; now runs on the **Google Gemini free tier** (no credit card, no GCP project)
because that's the key available for this hackathon. Only the model-call layer
(`agents/claude_client.py`) changed — the agents, orchestrator, and API are intact.

## Pipeline (the "agentic" part)

```
doc -> [0 Condense: pure Python, 0 tokens]
         |
         v
       digest -> [1 Domain Extraction] -> [2 Decomposition] -> [3 Dependency Mapping]
                                                                      |
                 [5 Synthesis] <- [4 Competitor Intel (Google Search)] <-+
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

## Setup (run from the `backend/` folder)

1. Get a free Gemini API key (no card): https://aistudio.google.com/apikey

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                 # then paste your key into .env
# GEMINI_API_KEY=...
# MODEL=gemini-2.5-flash

uvicorn main:app --reload --port 8000
```

Health check: http://localhost:8000/api/health -> {"status":"ok"}

## Endpoints

- POST /api/extract-text — multipart file upload (.pdf/.txt/.md) -> { "text": "..." }
- POST /api/analyze — body { "document": "..." } -> SSE stream of step events,
  ending with a `result` event containing the full architecture.

## Free-tier notes

- gemini-2.5-flash: ~10 requests/min, 1,500 requests/day — ample for demos.
- Google Search grounding: 1,500 free grounded prompts/day, powers the
  competitor feature for real.
- The competitor agent degrades gracefully if grounding fails, so the core
  analysis always completes.
