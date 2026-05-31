import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useState } from "react";

// Custom edge: shows the protocol label, and in edit mode reveals a small ×
// delete button on hover. Plain click on the edge path flips sync/async
// (handled by ReactFlow's onEdgeClick in ServiceMap).
export default function CustomEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, markerEnd, style, label, data,
  } = props;

  const [hover, setHover] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const d = data as { from?: string; to?: string; editMode?: boolean; onDelete?: (f: string, t: string) => void } | undefined;
  const editMode = d?.editMode;

  return (
    <>
      {/* wide invisible hit area so hover/click is easy to land */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        style={{ cursor: editMode ? "pointer" : "default" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {label && (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9,
                color: "var(--ink-faint)",
                background: "var(--bg)",
                padding: "1px 4px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {label as string}
            </span>
          )}
          {editMode && hover && d?.onDelete && d.from && d.to && (
            <button
              onClick={(e) => { e.stopPropagation(); d.onDelete!(d.from!, d.to!); }}
              title="Delete connection"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 99,
                background: "var(--rose)",
                color: "#1a0509",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                lineHeight: 1,
                fontWeight: 700,
                boxShadow: "0 0 10px -2px var(--rose)",
              }}
            >
              ×
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
