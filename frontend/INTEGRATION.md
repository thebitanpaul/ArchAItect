# ArchAItect — Frontend (drop-in)

These files plug into your existing Vite + React + TS + Tailwind v4 + shadcn setup.

## 1. Install the new dependencies

From your `frontend/` folder:

```bash
npm install @xyflow/react framer-motion lucide-react
```

(lucide-react is used by shadcn too, so you may already have it — installing again is harmless.)

## 2. Copy these files into your project

Copy the contents of this `src/` folder over your existing `frontend/src/`:

```
src/
├── App.tsx                       (replace)
├── index.css                     (replace)
├── types/architecture.ts         (new)
├── lib/api.ts                     (new — keep your existing lib/utils.ts)
├── components/
│   ├── Logo.tsx                   (branching-architecture mark)
│   ├── InputPanel.tsx
│   ├── PipelineConsole.tsx
│   ├── ServiceMap.tsx             (draggable nodes + fullscreen + blast-radius highlight)
│   ├── ServiceNode.tsx
│   ├── ServiceDrawer.tsx
│   ├── CompetitorPanel.tsx
│   ├── RiskAudit.tsx              (NEW — AI design review + "apply fix")
│   ├── ResiliencePanel.tsx        (NEW — failure blast-radius simulator)
│   ├── RoadmapPanel.tsx           (NEW — phased migration plan)
│   └── ResultsSkeleton.tsx        (full-page loading skeleton)
```

Your existing `components/ui/button.tsx` and `lib/utils.ts` are untouched.

## Above-and-beyond features (beyond the problem statement)

The flow is now **map-first, analyze-on-demand** — which is both better UX and
cheaper on tokens:

1. **Service map first.** `/api/analyze` produces only the map (domain →
   decompose → dependencies) plus the free resilience analysis. No tokens are
   spent on review/roadmap/competitor unless you ask.
2. **Edit your design.** The Edit lens lets you add / delete / rename services.
   This reframes the whole tool: the architecture is *yours*, and the AI
   stress-tests it — not the AI second-guessing itself. After edits, click
   **re-analyze** to recompute dependencies + resilience (cheap: one LLM call).
3. **On-demand AI Risk Audit.** A separate analytical lens that surfaces the
   *tradeoffs* inherent in any decomposition (sync SPOFs, chatty chains, God
   services). Framed as a review board, not an apology. Each risk can be
   applied as one option via "apply fix".
4. **On-demand Resilience Simulator** (free, pure Python). Hover a service to
   simulate its failure; the map highlights the downstream blast radius.
   Async/event links contain failure; sync calls propagate it.
5. **On-demand Migration Roadmap** — phased strangler-fig delivery plan.
6. **On-demand Competitor Intel** — live web-searched comparison.

### New endpoints
- `POST /api/analyze` — SSE; map + resilience only
- `POST /api/review` `/api/roadmap` `/api/competitor` — JSON; on-demand analyses
- `POST /api/recompute` — after edits, recompute deps + resilience
- `POST /api/apply-fix` — apply an AI tradeoff fix, recompute

## 3. Make sure the `@` path alias works

The code imports with `@/` (e.g. `@/components/InputPanel`). Your shadcn setup
almost certainly already configured this. Verify two things:

**vite.config.ts** has the alias:
```ts
import path from "path";
// inside defineConfig:
resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
```

**tsconfig.app.json** has paths (NOT baseUrl — baseUrl is deprecated in new TS):
```json
"compilerOptions": {
  "paths": { "@/*": ["./src/*"] }
}
```

## 4. Run

Make sure the backend is running on port 8000, then:

```bash
npm run dev
```

Open the Vite URL (usually http://localhost:5173).

## How it works

- Paste a spec or click **load sample**, then **Identify Microservices**.
- A full-page **skeleton loader** shows while the pipeline runs, so the page has
  structure instead of being empty.
- The Agent Pipeline console lights up step by step as the SSE stream arrives.
- The Service Map renders with React Flow: solid cyan = sync calls, dashed
  violet (animated) = async events. Node accent color = data store type.
- **Drag any node** to rearrange the map; **click** a node for its detail drawer.
- **Expand** button (top-right of the map) maximizes it to full screen; Esc exits.
- The header shows a **live engine status** (pings the backend) and an **export
  json** button to download the full architecture.
- Competitor panel shows real, web-searched competitor services + takeaways.

## If the map looks cramped

React Flow auto-fits. If you add a huge spec with many services, scroll/zoom
with the controls bottom-left, or drag nodes around — positions are editable.

## CORS note

The backend already allows `http://localhost:5173` and `127.0.0.1:5173`. If your
Vite runs on a different port, add it to `allow_origins` in `backend/main.py`.
