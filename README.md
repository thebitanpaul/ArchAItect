<div align="center">

# 🏛️ ArchAItect

### Shape your business with AI

[![Live Demo](https://img.shields.io/badge/Live%20App-Open%20in%20Vercel-blue?style=for-the-badge&logo=vercel)](https://archaitect-ten.vercel.app)

<img alt="Hero Image" src="https://res.cloudinary.com/b0tb1mho/image/upload/v1784626188/q8vgomhungoglex9axyk.webp"/>

**Turn a plain-English requirements document into a complete microservice architecture — a service map, an AI risk audit, a failure-resilience simulation, architecture metrics, a traceability matrix, a migration roadmap, and live competitor intelligence.**

</div>

---

## 🎥 Demo

<div align="center">

https://github.com/user-attachments/assets/20b3656f-5844-4289-9700-e4c1c3e3f12a


### Architecture Overview
<img alt="Architecture Overview" src="https://res.cloudinary.com/b0tb1mho/image/upload/v1784579257/lad6w4g1ks2egche5luh.webp"/>

### Cohesion · Coupling · Scalability · DDD
<img alt="Cohesion · Coupling · Scalability · DDD" src="https://res.cloudinary.com/b0tb1mho/image/upload/v1784579254/ekgniehr6yzragge16kb.webp"/>

### Generated Service Map
<img alt="Generated Service Map" src="https://res.cloudinary.com/b0tb1mho/image/upload/v1784579260/ussn9x2puahejiybfqf9.webp"/>

*A full walkthrough of ArchAItect — from requirements document to a stress-tested microservice architecture.*

</div>

---

## Table of contents

- [What is ArchAItect?](#what-is-archaitect)
- [Who is this for?](#who-is-this-for)
- [What it produces](#what-it-produces)
- [How it works (the interesting part)](#how-it-works-the-interesting-part)
- [The token-efficiency philosophy](#the-token-efficiency-philosophy)
- [Bring your own key (BYO)](#bring-your-own-key-byo)
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
- **Students & learners** — to *see* Domain-Driven Design, coupling/cohesion, and resilience concepts applied to a real spec, each explained inline.

You do **not** need to be a microservices expert to use it — every metric and term has an in-app "ℹ️" explanation describing what it means and exactly how it's computed.

---

## What it produces

After you paste or upload a requirements document, ArchAItect generates:

| Output | What it is | How it's computed |
|---|---|---|
| **Service Map** | An interactive graph of the proposed microservices and their dependencies (sync vs async). | 3 LLM calls (domain → decompose → dependencies) |
| **Resilience Simulator** | Hover any service to simulate its failure; the map highlights the downstream "blast radius". Flags single points of failure. | Pure Python (graph traversal) — 0 tokens |
| **Architecture Metrics** | Cohesion, coupling looseness, scalability, business-boundary quality, and a Domain-Driven Design view, per service. | Pure Python (graph formulas) — 0 tokens |
| **Risk Audit** | A senior-architect-style critique: God services, chatty sync chains, single points of failure, with a health score and fix suggestions. | 1 LLM call (on demand) |
| **Traceability Matrix** | Maps every requirement from the document to the service(s) that satisfy it; surfaces coverage gaps. | 1 LLM call (on demand) |
| **Migration Roadmap** | A phased, strangler-fig delivery plan ordered by the dependency graph. | 1 LLM call (on demand) |
| **Competitor Intelligence** | How a real company in the same domain is actually architected, using live web search. | 1 grounded LLM call (on demand) |

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

**Step 1 — Document compression (no AI).** Before a single token is spent, `preprocess.py` runs classic extractive summarization: it strips boilerplate (page numbers, tables of contents, legal/version headers), scores every sentence and heading by "requirement signal" (requirement keywords like *shall/must/manage*, domain nouns, structural cues), deduplicates, and keeps the densest content up to a character budget. A 250 KB document becomes a tight digest — and that digest is the *only* raw document text any model ever sees.

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

> **The one-line pitch:** *We don't blindly stuff documents into an LLM. We pre-process in pure Python and send only the distilled signal, then use the model surgically — only where reasoning is genuinely needed, and only on demand.*

---

## Bring your own key (BYO)

You can run the whole app on **your own LLM account**. Click the **engine pill** in the
header (top right, the one showing `engine online`) and the engine dialog opens.

**Two modes:**

| Mode | What it is |
|---|---|
| **phiUture free** | A shared key hosted with the app — nothing to sign up for. Because it's shared, **availability depends on live traffic**: when it's saturated the pill turns amber and you're asked to add your own key. |
| **Your own key** | Pick a provider, optionally pin a model, paste a key, click **Test key** to prove it works, then **Save & use**. Every analysis from then on runs through your account. |

**Supported providers** — each one links straight to its key page from the dialog:

| Provider | Free tier? | Live web search |
|---|---|---|
| Google Gemini | Yes, no card needed | ✅ Google Search grounding |
| Anthropic Claude | No | ✅ web search tool |
| OpenAI GPT | No | — |
| AWS Bedrock (Claude / Nova / Llama) | No | — |
| Groq | Yes, generous | — |
| Mistral AI | Yes, experimental | — |
| OpenRouter | Some free models | — |
| xAI Grok | No | — |
| DeepSeek | No | — |
| Custom (OpenAI-compatible) | Ollama, vLLM, LM Studio, an internal gateway… | — |

Providers without a search tool still produce Competitor Intelligence — the model is
explicitly told it has no live lookup and to label its sources as public knowledge, so
nothing is passed off as freshly researched.

Model IDs move fast, so the model field is a free-text box with suggestions rather than a
fixed list: type any model your account can reach and **Test key** tells you immediately
whether it works.

### How your key is kept safe

- **Encrypted before storage.** The key is sealed with AES-256-GCM and kept in IndexedDB.
- **The wrapping key can't be read out.** It's generated in your browser with
  `extractable: false`, so the raw key material is never available to any script —
  including ArchAItect's own. Nothing readable is ever written to `localStorage`.
- **Nothing is stored server-side.** The backend uses the key for that one request and
  discards it: no logs, no database, no disk. Secrets are also stripped out of provider
  error messages before they're returned (`llm_runtime.redact`).
- **You choose the lifetime.** *Remember on this device* persists the encrypted copy;
  unchecked, the key lives in memory and dies with the tab. **Remove key** wipes both.
- **Not prefilled back into the page.** Once saved, the dialog says a key exists rather
  than re-rendering the secret into the DOM.

The one thing browser storage can't defend against is script already executing on the
page — no web app can. What it does guarantee is that the key is never at rest in a
readable form.

### Fair-use limits on the free engine

The shared key is protected by three rolling windows, all configurable on the backend:
`FREE_TIER_HOURLY_LIMIT` (default 150), `FREE_TIER_DAILY_LIMIT` (900), and
`FREE_TIER_IP_HOURLY_LIMIT` (18, so one visitor can't drain the pool). When a limit is
hit, requests return **429** with a message pointing at the BYO dialog, and
`GET /api/health` reports the live status that drives the pill.

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
- Ten LLM providers behind one interface — Gemini via `google-genai`, everything else over
  plain HTTPS with `httpx`, plus `boto3` for AWS SigV4
- pypdf for document text extraction

The frontend talks to the backend over a small REST/SSE API. The backend is stateless and
holds no user secrets: credentials arrive with each request, live in a `ContextVar` for its
duration, and are gone when the response ends. All provider-specific wire formats live in
`llm_providers.py`, so the agents and orchestrator never know which model they're talking to.

---

## Project structure

```
ArchAItect/
├── backend/
│   ├── main.py                  # FastAPI app + HTTP/SSE endpoints
│   ├── orchestrator.py          # Runs the pipeline; on-demand analysis helpers
│   ├── llm_providers.py         # Provider catalog + per-vendor wire formats
│   ├── llm_runtime.py           # Per-request credentials, redaction, free-tier gate
│   ├── preprocess.py            # Document compression (pure Python, 0 tokens)
│   ├── resilience.py            # Blast-radius simulation (pure Python, 0 tokens)
│   ├── metrics.py               # Cohesion/coupling/scalability/DDD (pure Python, 0 tokens)
│   ├── requirements.txt
│   └── agents/
│       ├── llm_client.py        # Retry, fallback, JSON extraction (provider-agnostic)
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
        ├── lib/
        │   ├── api.ts           # Typed client for the backend
        │   ├── config.ts        # API base URL
        │   ├── keyvault.ts      # AES-GCM encrypted key storage in the browser
        │   └── llm.ts           # Engine store: provider, model, free-tier status
        ├── types/architecture.ts
        └── components/          # Map, panels, editor, engine dialog, tooltips, etc.
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

1. **Welcome screen** → click **Let's go**. A callout points at the **engine pill** in the
   header for 10 seconds (dismissable) — that's where you add your own LLM key. See
   [Bring your own key](#bring-your-own-key-byo).
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
- The **backend** runs Python, holds the shared free-tier key, and streams responses → it needs a real server process. **This is why GitHub Pages alone is not enough** — Pages only serves static files; it can't run Python or safely hold your Gemini key. (If you put the key in the frontend, anyone could read it and drain your quota.)

> A visitor's **own** key is different: it never touches the server's environment. It's
> encrypted in their browser and passed through per request. See
> [Bring your own key](#bring-your-own-key-byo).

### Recommended free setup

**Backend → [Render](https://render.com) free web service** (or Railway / Fly.io):
1. Push this repo to GitHub.
2. On Render: **New → Web Service**, point it at your repo, root directory `backend`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables: `GEMINI_API_KEY`, `MODEL`, and `CORS_ORIGINS` (set this to your frontend URL, e.g. `https://your-app.vercel.app`).
6. Note the service URL Render gives you (e.g. `https://archaitect-api.onrender.com`).

> `GEMINI_API_KEY` is now **optional** — it only powers the free phiUture engine. Leave it
> unset and the app still works: the free option reports itself as unconfigured and
> visitors bring their own key.

> Free instances sleep when idle, so the **first request after a pause takes ~30–60s to wake**. Fine for a demo; mention it if you're presenting live.

**Frontend → [Vercel](https://vercel.com) or [Netlify](https://netlify.com) free tier** (recommended over GitHub Pages because env vars and SPA routing are easier):
1. **New Project**, import the repo, set the root directory to `frontend`.
2. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
3. Add an environment variable **`VITE_API_BASE`** = your Render backend URL.
4. Deploy. Then go back to Render and make sure `CORS_ORIGINS` includes the Vercel URL.

### Can I use GitHub Pages?

You *can* host the **frontend** on GitHub Pages (build with `npm run build`, publish the `dist/` folder, and set `VITE_API_BASE` at build time), but you **still need a separate backend host** for the Python API and key. So Pages can be the frontend half of the split — it just can't be the whole thing.

### Configuration knobs that make deployment work

These are already wired in so the same code runs locally and in production:

| Where | Variable | Required | Purpose |
|---|---|---|---|
| Frontend build | `VITE_API_BASE` | Yes in prod | Points the app at your deployed backend (defaults to `http://localhost:8000`). |
| Backend env | `CORS_ORIGINS` | Yes in prod | Comma-separated list of allowed frontend origins. |
| Backend env | `GEMINI_API_KEY` | Optional | Powers the free phiUture engine. Unset ⇒ visitors must bring their own key. |
| Backend env | `MODEL` / `FALLBACK_MODEL` | Optional | Which Gemini models the free engine uses. |
| Backend env | `FREE_TIER_HOURLY_LIMIT` | Optional | Shared-key calls per hour, all visitors (default `150`). |
| Backend env | `FREE_TIER_DAILY_LIMIT` | Optional | Shared-key calls per day (default `900`). |
| Backend env | `FREE_TIER_IP_HOURLY_LIMIT` | Optional | Shared-key calls per visitor per hour (default `18`). |

No environment variable is ever needed for a visitor's own key — that's supplied by the
browser per request, so BYO works on a fresh deploy with nothing configured.

---

## Glossary

- **Actor** — who uses the system (e.g. Customer, Admin).
- **Entity** — a core data "thing" the system stores (e.g. Order, Payment).
- **Functional area** — a capability bucket (e.g. Ordering, Payments).
- **Bounded context** — a self-contained business zone that one service owns (Domain-Driven Design).
- **Responsibility** — the single job a service does.
- **Sync (REST)** — a service calls another and *waits* for the reply (like a phone call).
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

## About phiUture


Welcome to phiUture — Beautiful Technology. Centered Around You. Shaping Tomorrow.

Inspired by the Golden Ratio (φ), our name represents beautiful, intelligent engineering, while the "U" stands for You—placing people at the center of every solution we build.

phiUture is an AI-first software company creating intelligent products, automation systems, and modern digital experiences. This channel documents the journey of building practical AI solutions, from concept to deployment.

```text
Here you'll find:
• AI applications and product demos
• AI agents and automation workflows
• Web and mobile app showcases
• Machine Learning and Data Engineering projects
• Product launches and development insights
• UI/UX and software engineering content
• Tutorials, experiments, and future innovations
```

| Personal | Business | Artist |
|----------|----------|--------|
| [![GitHub](https://img.shields.io/badge/GitHub-thebitanpaul-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/thebitanpaul) | [![Website](https://img.shields.io/badge/Website-phiUture-000000?style=for-the-badge&logo=googlechrome&logoColor=white)](https://phiuture.com) | [![YouTube](https://img.shields.io/badge/YouTube-thebitanpaul-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@thebitanpaul) |
| [![LinkedIn](https://img.shields.io/badge/LinkedIn-thebitanpaul-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/thebitanpaul) | [![YouTube](https://img.shields.io/badge/YouTube-phiUture-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@phiuture) | [![Spotify](https://img.shields.io/badge/Spotify-1DB954?style=for-the-badge&logo=spotify&logoColor=white)](https://open.spotify.com/artist/6ghDcCBlKzJIgm3e586jpV) |
| [![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/thebitanpaul) | [![Google Play](https://img.shields.io/badge/Google_Play-Developer-34A853?style=for-the-badge&logo=googleplay&logoColor=white)](https://play.google.com/store/apps/dev?id=6358474525178045834&hl=en) | [![YouTube Music](https://img.shields.io/badge/YouTube_Music-FF0000?style=for-the-badge&logo=youtubemusic&logoColor=white)](https://music.youtube.com/playlist?list=OLAK5uy_km3cjEB2zl59Etcgv9UBKWw800O9G3NdE) |
| [![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://facebook.com/thebitanpaul) | [![Email](https://img.shields.io/badge/Business_Email-thephiuture%40gmail.com-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:thephiuture@gmail.com) | [![Amazon Music](https://img.shields.io/badge/Amazon_Music-46C3D0?style=for-the-badge&logo=amazonmusic&logoColor=white)](https://music.amazon.com/albums/B0G52QMYDC) |
| [![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/thebitanpaul_) |  | [![Apple Music](https://img.shields.io/badge/Apple_Music-FA243C?style=for-the-badge&logo=applemusic&logoColor=white)](https://music.apple.com/us/artist/thebitanpaul/1858534880) |
| [![Snapchat](https://img.shields.io/badge/Snapchat-FFFC00?style=for-the-badge&logo=snapchat&logoColor=000000)](https://snapchat.com/t/UgO0Iywr) |  | [![JioSaavn](https://img.shields.io/badge/JioSaavn-2BC5B4?style=for-the-badge&logo=jiosaavn&logoColor=white)](https://www.jiosaavn.com/artist/thebitanpaul-songs/zuo0NgC65gQ_) |
| [![Email](https://img.shields.io/badge/Personal_Email-thebitanpaul%40gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:thebitanpaul@gmail.com) |  |  |


<div align="center">

**2026 · © phiUture · All Rights Reserved**

</div>
