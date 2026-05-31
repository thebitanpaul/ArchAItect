
# 🏛️ ArchAItect 

### Shape your business with AI

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20App-Open%20in%20Vercel-blue?style=for-the-badge&logo=vercel)](https://archaitect-ten.vercel.app)

**Turn a plain-English requirements document into a complete microservice architecture — a service map, an AI risk audit, a failure-resilience simulation, architecture metrics, a traceability matrix, a migration roadmap, and live competitor intelligence.**

</div>

---

## 🎥 Demo

<div align="center">

https://github.com/user-attachments/assets/20b3656f-5844-4289-9700-e4c1c3e3f12a

_A full walkthrough of ArchAItect — from requirements document to a stress-tested microservice architecture._

</div>

---

## Table of contents

- [What is ArchAItect?](#what-is-archaitect)
- [Who is this for?](#who-is-this-for)
- [What it produces](#what-it-produces)
- [How it works (the interesting part)](#how-it-works-the-interesting-part)
- [The token-efficiency philosophy](#the-token-efficiency-philosophy)
- [Architecture & tech stack](#architecture--tech-stack)
- [Project structure](#project-structure)
- [Running it locally](#running-it-locally)
- [How to use the app](#how-to-use-the-app)
- [Deploying it for free](#deploying-it-for-free)
- [Glossary](#glossary)
- [Roadmap & ideas](#roadmap--ideas)

---

## What is ArchAItect?

Designing a microservice architecture from a requirements document is slow, expert work: you read the spec, identify the business capabilities, decide where to draw service boundaries, map how the services talk to each other, and then stress-test the design for risks. ArchAItect does the first draft of all of that in under a minute — and then gives you a set of analytical "lenses" to critique, refine, and plan the architecture.

The guiding principle is **logic over LLM wherever possible**. Most of the heavy lifting (document compression, resilience simulation, architecture metrics) is done with plain, deterministic Python — the language model is used surgically, only where genuine semantic reasoning is needed, and only when you ask for it.

---

## Who is this for?

- **Software architects & senior engineers** — to get a fast, structured first draft of a decomposition and stress-test their own designs.
- **Engineering teams & tech leads** — to align on service boundaries and migration sequencing from a shared, visual reference.
- **Product & pre-sales teams** — to translate a client's requirements into a credible technical proposal, complete with how comparable companies architect similar systems.
- **Students & learners** — to _see_ Domain-Driven Design, coupling/cohesion, and resilience concepts applied to a real spec, each explained inline.

You do **not** need to be a microservices expert to use it — every metric and term has an in-app "ℹ️" explanation describing what it means and exactly how it's computed.

---

## What it produces

After you paste or upload a requirements document, ArchAItect generates:

| Output                      | What it is                                                                                                                              | How it's computed                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Service Map**             | An interactive graph of the proposed microservices and their dependencies (sync vs async).                                              | 3 LLM calls (domain → decompose → dependencies) |
| **Resilience Simulator**    | Hover any service to simulate its failure; the map highlights the downstream "blast radius". Flags single points of failure.            | Pure Python (graph traversal) — 0 tokens        |
| **Architecture Metrics**    | Cohesion, coupling looseness, scalability, business-boundary quality, and a Domain-Driven Design view, per service.                     | Pure Python (graph formulas) — 0 tokens         |
| **Risk Audit**              | A senior-architect-style critique: God services, chatty sync chains, single points of failure, with a health score and fix suggestions. | 1 LLM call (on demand)                          |
| **Traceability Matrix**     | Maps every requirement from the document to the service(s) that satisfy it; surfaces coverage gaps.                                     | 1 LLM call (on demand)                          |
| **Migration Roadmap**       | A phased, strangler-fig delivery plan ordered by the dependency graph.                                                                  | 1 LLM call (on demand)                          |
| **Competitor Intelligence** | How a real company in the same domain is actually architected, using live web search.                                                   | 1 grounded LLM call (on demand)                 |

You can **edit the architecture by hand** at any point — add, rename, or delete services, wire new dependencies (and toggle them sync/async), change data stores, and add external integrations (payment gateways, auth providers, etc.). Editing is **free** (no tokens): the resilience and metrics recompute instantly in Python.

---

## How it works (the interesting part)

The pipeline is deliberately staged so that **the expensive steps run last and only on demand**.

```
        ┌─────────────────────────────────────────────────────────────┐
        │  1. PREPROCESS  (pure Python, 0 tokens)                      │
        │     Condense the raw document → a dense ~3,500-char digest    │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌──────────────────────────▼──────────────────────────────────┐
        │  2. REQUIRED AGENTS  (3 LLM calls, run automatically)         │
        │     Domain  →  Decompose  →  Dependencies                     │
        └──────────────────────────┬──────────────────────────────────┘
                                   │
        ┌──────────────────────────▼──────────────────────────────────┐
        │  3. FREE ANALYSES  (pure Python, 0 tokens, run with the map)  │
        │     Resilience (blast radius)  +  Architecture metrics        │
        └──────────────────────────┬──────────────────────────────────┘
                                   │
        ┌──────────────────────────▼──────────────────────────────────┐
        │  4. OPTIONAL ANALYSES  (1 LLM call each, ONLY when clicked)   │
        │     Risk Audit · Traceability · Roadmap · Competitor          │
        └─────────────────────────────────────────────────────────────┘
```

**Step 1 — Document compression (no AI).** Before a single token is spent, `preprocess.py` runs classic extractive summarization: it strips boilerplate (page numbers, tables of contents, legal/version headers), scores every sentence and heading by "requirement signal" (requirement keywords like _shall/must/manage_, domain nouns, structural cues), deduplicates, and keeps the densest content up to a character budget. A 250 KB document becomes a tight digest — and that digest is the _only_ raw document text any model ever sees.

**Step 2 — The required agents.** The digest flows through three focused agents, each a single LLM call returning strict JSON:

- **Domain agent** — extracts actors, entities, and functional areas.
- **Decompose agent** — proposes services with bounded contexts, responsibilities, data stores, and external integrations (applying polyglot persistence so stores genuinely vary).
- **Dependency agent** — maps the edges between services (synchronous REST vs asynchronous events).

**Step 3 — Free analyses.** `resilience.py` and `metrics.py` derive real architecture insight from the graph using deterministic Python — no tokens. Resilience computes each service's blast radius (sync calls propagate failure; async/queues contain it). Metrics compute cohesion, coupling, scalability, and boundary quality from well-known formulas.

**Step 4 — Optional analyses.** Risk Audit, Traceability, Roadmap, and Competitor each cost exactly one LLM call and run **only** when you open that lens and confirm — so you never pay for analysis you don't look at. Competitor intel uses the model's **live web-search grounding** to return real, sourced findings rather than hallucinations.

---

## The token-efficiency philosophy

This project treats LLM tokens as a scarce resource and is engineered around minimizing them:

- **Pure-Python first.** Compression, resilience, and metrics — three of the most useful outputs — cost **zero tokens**.
- **Distilled input.** Only the condensed digest reaches the model, not the raw document.
- **Slim inter-agent payloads.** Agents pass each other only the fields the next step needs (id, name, responsibility), not full objects — cutting input tokens by ~60–70% per downstream call.
- **On-demand, not all-at-once.** The four LLM analyses fire only when explicitly requested.
- **Token-free editing.** Manual edits recompute resilience and metrics in Python; no model call.
- **Single grounded call** for competitor intel (search + structured output in one round trip).

> **The one-line pitch:** _We don't blindly stuff documents into an LLM. We pre-process in pure Python and send only the distilled signal, then use the model surgically — only where reasoning is genuinely needed, and only on demand._

---

## Architecture & tech stack

**Frontend** — a static single-page app:

- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- React Flow (`@xyflow/react`) for the interactive service map
- Framer Motion for animation
- lucide-react for icons

**Backend** — a stateless HTTP API:

- Python + FastAPI (with Server-Sent Events for streaming the pipeline)
- Google Gemini via the `google-genai` SDK (free tier; web-search grounding)
- pypdf for document text extraction

The frontend talks to the backend over a small REST/SSE API. The backend holds the only secret (the model API key) and is the single integration point with the LLM provider — swapping models or providers touches only `agents/llm_client.py`.

---

## Project structure

```
ArchAItect/
├── backend/
│   ├── main.py                  # FastAPI app + HTTP/SSE endpoints
│   ├── orchestrator.py          # Runs the pipeline; on-demand analysis helpers
│   ├── preprocess.py            # Document compression (pure Python, 0 tokens)
│   ├── resilience.py            # Blast-radius simulation (pure Python, 0 tokens)
│   ├── metrics.py               # Cohesion/coupling/scalability/DDD (pure Python, 0 tokens)
│   ├── requirements.txt
│   └── agents/
│       ├── llm_client.py        # The single LLM integration point (provider-agnostic)
│       ├── _payload.py          # Slims payloads passed between agents
│       ├── domain_agent.py      # Extracts the domain model
│       ├── decompose_agent.py   # Proposes the services
│       ├── dependency_agent.py  # Maps service dependencies
│       ├── review_agent.py      # Risk audit (on demand)
│       ├── traceability_agent.py# Requirements → services matrix (on demand)
│       ├── roadmap_agent.py     # Migration roadmap (on demand)
│       ├── competitor_agent.py  # Competitor intel via web search (on demand)
│       └── refine_agent.py      # Applies an AI-suggested fix
└── frontend/
    └── src/
        ├── App.tsx              # Orchestrates the whole UI
        ├── lib/api.ts           # Typed client for the backend
        ├── types/architecture.ts
        └── components/          # Map, panels, editor, tooltips, etc.
```

---

## Running it locally

### Prerequisites

- **Node.js** 18+ and **Python** 3.10+
- A **free Google Gemini API key** — get one (no credit card) at <https://aistudio.google.com/apikey>

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
```

Create a file named **`.env`** inside `backend/` containing:

```env
GEMINI_API_KEY=AIza...your-key...
MODEL=gemini-2.5-flash
FALLBACK_MODEL=gemini-2.5-flash-lite
```

> **Windows note:** make sure the file is named exactly `.env` and not `.env.txt`. If Notepad saved it with the extension, rename it: `ren .env.txt .env`. Don't put quotes around the key.

Start the API:

```bash
uvicorn main:app --reload --port 8000
```

Verify it's up: open <http://localhost:8000/api/health> — you should see `{"status":"ok"}`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually <http://localhost:5173>). The header shows a live **engine online** indicator when it can reach the backend.

---

## How to use the app

1. **Welcome screen** → click **Let's go**.
2. **Paste** a requirements document (or **Load Sample**, or upload a `.pdf` / `.txt` / `.md`) and click **Identify Microservices**.
3. The page generates and scrolls to the **Service Map** (left) with the **Resilience** lens already populated (free).
4. Use the **lens bar** to switch views. The map stays pinned on the left as your constant reference:
   - **Edit** — add/rename/delete services, change data stores and integrations, and wire dependencies (drag from a node's bottom handle to another's top handle; click an edge to flip sync/async; hover an edge and click ✕ to delete). After edits, click **Re-analyze** (free) to refresh resilience and metrics.
   - **Metrics** — cohesion, coupling, scalability, boundary quality, and the DDD view (instant, free).
   - **Risk Audit / Traceability / Roadmap / Competitor** — each shows a one-click prompt and only spends tokens when you confirm. A dot turns from amber (on-demand) to green (generated).
5. **Export JSON** at any time to save the full architecture.

Every metric and term has an **ℹ️** you can hover for a plain-English definition and the exact formula used.

---

## Deploying it for free

ArchAItect is **two pieces with different needs**, so the honest answer is a **split deployment**:

- The **frontend** is just static files → any static host works.
- The **backend** runs Python, holds your secret API key, and streams responses → it needs a real server process. **This is why GitHub Pages alone is not enough** — Pages only serves static files; it can't run Python or safely hold your Gemini key. (If you put the key in the frontend, anyone could read it and drain your quota.)

### Recommended free setup

**Backend → [Render](https://render.com) free web service** (or Railway / Fly.io):

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, point it at your repo, root directory `backend`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables: `GEMINI_API_KEY`, `MODEL`, and `CORS_ORIGINS` (set this to your frontend URL, e.g. `https://your-app.vercel.app`).
6. Note the service URL Render gives you (e.g. `https://archaitect-api.onrender.com`).

> Free instances sleep when idle, so the **first request after a pause takes ~30–60s to wake**. Fine for a demo; mention it if you're presenting live.

**Frontend → [Vercel](https://vercel.com) or [Netlify](https://netlify.com) free tier** (recommended over GitHub Pages because env vars and SPA routing are easier):

1. **New Project**, import the repo, set the root directory to `frontend`.
2. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
3. Add an environment variable **`VITE_API_BASE`** = your Render backend URL.
4. Deploy. Then go back to Render and make sure `CORS_ORIGINS` includes the Vercel URL.

### Can I use GitHub Pages?

You _can_ host the **frontend** on GitHub Pages (build with `npm run build`, publish the `dist/` folder, and set `VITE_API_BASE` at build time), but you **still need a separate backend host** for the Python API and key. So Pages can be the frontend half of the split — it just can't be the whole thing.

### Configuration knobs that make deployment work

These are already wired in so the same code runs locally and in production:

| Where          | Variable                   | Purpose                                                                        |
| -------------- | -------------------------- | ------------------------------------------------------------------------------ |
| Frontend build | `VITE_API_BASE`            | Points the app at your deployed backend (defaults to `http://localhost:8000`). |
| Backend env    | `GEMINI_API_KEY`           | Your model key (kept server-side, never shipped to the browser).               |
| Backend env    | `CORS_ORIGINS`             | Comma-separated list of allowed frontend origins.                              |
| Backend env    | `MODEL` / `FALLBACK_MODEL` | Which Gemini models to use.                                                    |

---

## Glossary

- **Actor** — who uses the system (e.g. Customer, Admin).
- **Entity** — a core data "thing" the system stores (e.g. Order, Payment).
- **Functional area** — a capability bucket (e.g. Ordering, Payments).
- **Bounded context** — a self-contained business zone that one service owns (Domain-Driven Design).
- **Responsibility** — the single job a service does.
- **Sync (REST)** — a service calls another and _waits_ for the reply (like a phone call).
- **Async (events)** — a service fires an event and moves on; others react later (like a text message).
- **Cohesion** — how focused a service is on one job.
- **Coupling** — how dependent services are on one another (fan-in = who depends on it; fan-out = what it depends on).
- **Blast radius** — how many services break if a given service fails.
- **Aggregate root** — the primary entity that anchors a service's consistency boundary.

---

## Roadmap & ideas

- Persisted projects / shareable links
- Multiple competitor comparisons side by side
- Export to draw.io / Mermaid / C4 diagrams
- Pluggable model providers (the client is already isolated to one file)
- Confidence indicators on AI-generated mappings

---

## License

This project is licensed under the [Apache-2.0](LICENSE).
See the LICENSE file for full license text.

## 🚀 About Me

I am an AI Specialist and Data Engineer at Navikenz and an Android Developer passionate about building intelligent, user-centric applications.
Both Machine Learning and Android Development fascinate me, and I’ve also worked on AWS & Azure Cloud CI/CD & deployments.

To know more about me, just Google `“Bitan Paul”.`

## 🔗 Links

[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/thebitanpaul)
[![linkedin](https://img.shields.io/badge/linkedin-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/thebitanpaul)
[![twitter](https://img.shields.io/badge/twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/thebitanpaul_)

---

<div align="center">

**2026 · © phiUture · All Rights Reserved**

</div>
