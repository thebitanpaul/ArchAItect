import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useReactFlow,
  type Node,
  type Edge as RFEdge,
  MarkerType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2, Minimize2 } from "lucide-react";
import ServiceNode from "./ServiceNode";
import CustomEdge from "./CustomEdge";
import type { Architecture } from "@/types/architecture";

const nodeTypes = { service: ServiceNode };
const edgeTypes = { custom: CustomEdge };

interface Props {
  arch: Architecture;
  selectedId: string | null;
  onSelect: (id: string) => void;
  highlight?: { source: string; set: string[] } | null;
  editMode?: boolean;
  connectType?: "sync" | "async";
  onConnect?: (from: string, to: string, type: "sync" | "async") => void;
  onDeleteEdge?: (from: string, to: string) => void;
  onCycleEdge?: (from: string, to: string) => void;
}

/** Layered auto-layout: roots on top, dependents below. */
function layout(arch: Architecture): Record<string, { x: number; y: number }> {
  const ids = arch.services.map((s) => s.id);
  const incoming: Record<string, number> = {};
  ids.forEach((id) => (incoming[id] = 0));
  arch.edges.forEach((e) => {
    if (e.to in incoming) incoming[e.to] += 1;
  });

  const layer: Record<string, number> = {};
  ids.forEach((id) => (layer[id] = incoming[id] === 0 ? 0 : 1));
  for (let pass = 0; pass < ids.length; pass++) {
    arch.edges.forEach((e) => {
      if (e.from in layer && e.to in layer) {
        layer[e.to] = Math.max(layer[e.to], layer[e.from] + 1);
      }
    });
  }

  const byLayer: Record<number, string[]> = {};
  ids.forEach((id) => {
    const l = layer[id] ?? 0;
    (byLayer[l] ??= []).push(id);
  });

  const COL = 290;
  const ROW = 220;
  const pos: Record<string, { x: number; y: number }> = {};
  Object.keys(byLayer)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((l) => {
      const row = byLayer[l];
      const totalW = (row.length - 1) * COL;
      row.forEach((id, i) => {
        pos[id] = { x: i * COL - totalW / 2, y: l * ROW };
      });
    });
  return pos;
}

function Flow({ arch, selectedId, onSelect, highlight, editMode, onConnect, onDeleteEdge, onCycleEdge }: Props) {
  // Build initial nodes ONCE per architecture so dragging isn't reset on re-render.
  const initialNodes: Node[] = useMemo(() => {
    const pos = layout(arch);
    return arch.services.map((s) => ({
      id: s.id,
      type: "service",
      position: pos[s.id] ?? { x: 0, y: 0 },
      data: { service: s, selected: false, onSelect, highlightState: "none" },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arch]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const { fitView } = useReactFlow();

  // Reset nodes when a NEW architecture loads.
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Reliably frame the graph after the node set changes (fixes the "top node
  // shoots off-screen" race). Keyed on the set of ids, double rAF so the DOM
  // has measured node sizes before fitView computes the bounds.
  const idKey = arch.services.map((s) => s.id).join(",");
  useEffect(() => {
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        fitView({ padding: 0.25, duration: 400 });
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [idKey, fitView]);

  // Reflect selection + highlight into node data without recreating positions.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        let hl: "none" | "source" | "impacted" | "dim" = "none";
        if (highlight && highlight.set.length >= 0 && (highlight.source || highlight.set.length)) {
          if (n.id === highlight.source) hl = "source";
          else if (highlight.set.includes(n.id)) hl = "impacted";
          else if (highlight.source || highlight.set.length) hl = "dim";
        }
        return { ...n, data: { ...n.data, selected: n.id === selectedId, highlightState: hl } };
      })
    );
  }, [selectedId, highlight, setNodes]);

  // Edges are PURELY derived from arch.edges (single source of truth in App).
  // Stable id `from->to` lets React Flow track them across changes. Selection
  // styling is folded in here so there's no second effect fighting this one.
  const edges: RFEdge[] = useMemo(
    () =>
      arch.edges.map((e) => {
        const isAsync = e.type === "async";
        const color = isAsync ? "var(--violet)" : "var(--cyan-dim)";
        const touched = selectedId && (e.from === selectedId || e.to === selectedId);
        return {
          id: `${e.from}->${e.to}`,
          type: "custom",
          source: e.from,
          target: e.to,
          animated: isAsync,
          data: { from: e.from, to: e.to, editMode, onDelete: onDeleteEdge },
          style: {
            stroke: color,
            strokeWidth: touched ? 2.6 : 1.8,
            strokeDasharray: isAsync ? "6 4" : undefined,
            opacity: selectedId && !touched ? 0.22 : 0.95,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
          label: e.protocol,
        };
      }),
    [arch.edges, selectedId, editMode, onDeleteEdge]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.25}
      maxZoom={1.8}
      nodesDraggable
      nodesConnectable={!!editMode}
      elementsSelectable
      isValidConnection={(c) => !!c.source && !!c.target && c.source !== c.target}
      onConnect={(c) => {
        // New connections default to sync; user flips by clicking the edge.
        if (editMode && onConnect && c.source && c.target && c.source !== c.target) {
          onConnect(c.source, c.target, "sync");
        }
      }}
      onEdgeClick={(_, edge) => {
        if (!editMode) return;
        const d = edge.data as { from: string; to: string } | undefined;
        if (d && onCycleEdge) onCycleEdge(d.from, d.to); // flip sync<->async
      }}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => onSelect("")}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--line)" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

export default function ServiceMap({ arch, selectedId, onSelect, highlight, editMode, onConnect, onDeleteEdge, onCycleEdge }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  // Esc closes fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Header = (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--line)" }}>
      <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
        SERVICE MAP
      </span>
      {editMode && (
        <span className="rounded px-2 py-0.5 font-mono text-[9px]"
          style={{ background: "rgba(56,225,212,0.12)", color: "var(--cyan)", border: "1px solid var(--cyan)" }}>
          EDIT · drag handle to wire · click edge to flip sync/async · hover edge & click × to delete
        </span>
      )}
      <div className="ml-auto flex items-center gap-3 font-mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
        <Legend color="var(--cyan-dim)" label="sync" />
        <Legend color="var(--violet)" label="async" dashed />
        {!editMode && <span className="hidden sm:inline">· drag nodes · click for detail</span>}
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
          style={{ border: "1px solid var(--line)", color: "var(--ink-dim)", cursor: "pointer" }}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Maximize map"}
        >
          {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          <span>{fullscreen ? "exit" : "expand"}</span>
        </button>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "var(--bg)" }}>
        {Header}
        <div className="flex-1">
          <ReactFlowProvider>
            <Flow arch={arch} selectedId={selectedId} onSelect={onSelect} highlight={highlight} editMode={editMode} onConnect={onConnect} onDeleteEdge={onDeleteEdge} onCycleEdge={onCycleEdge} />
          </ReactFlowProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="panel panel-glow overflow-hidden" style={{ height: 600 }}>
      {Header}
      <div style={{ height: "calc(100% - 48px)" }}>
        <ReactFlowProvider>
          <Flow arch={arch} selectedId={selectedId} onSelect={onSelect} highlight={highlight} editMode={editMode} onConnect={onConnect} onDeleteEdge={onDeleteEdge} onCycleEdge={onCycleEdge} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ width: 16, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      {label}
    </span>
  );
}
