import { Handle, Position } from "@xyflow/react";
import type { Service } from "@/types/architecture";

interface NodeData {
  service: Service;
  selected: boolean;
  onSelect: (id: string) => void;
  highlightState?: "none" | "source" | "impacted" | "dim";
}

// Pick an accent per data store so the map is readable at a glance.
function storeColor(store: string): string {
  const s = (store || "").toLowerCase();
  if (s.includes("redis") || s.includes("cache")) return "var(--rose)";
  if (s.includes("mongo") || s.includes("document") || s.includes("nosql")) return "var(--violet)";
  if (s.includes("elastic") || s.includes("opensearch") || s.includes("search")) return "var(--amber)";
  if (s.includes("kafka") || s.includes("event") || s.includes("stream") || s.includes("queue")) return "#ff8c42";
  if (s.includes("warehouse") || s.includes("bigquery") || s.includes("redshift") || s.includes("analytic")) return "#7cc4ff";
  if (s.includes("neo4j") || s.includes("graph")) return "#c77dff";
  if (s.includes("influx") || s.includes("timescale") || s.includes("time")) return "#5ee6a8";
  if (s.includes("s3") || s.includes("blob") || s.includes("object")) return "#a0a0b0";
  if (s.includes("postgres") || s.includes("mysql") || s.includes("sql") || s.includes("relational")) return "var(--cyan)";
  return "var(--amber)";
}

export default function ServiceNode({ data }: { data: NodeData }) {
  const { service, selected, onSelect, highlightState = "none" } = data;
  const accent = storeColor(service.data_store);

  // highlight overrides (blast radius / risk)
  let borderColor = selected ? accent : "var(--line)";
  let boxShadow = selected
    ? `0 0 0 1px ${accent}, 0 0 36px -6px ${accent}`
    : "0 12px 30px -18px rgba(0,0,0,0.9)";
  let opacity = 1;

  if (highlightState === "source") {
    borderColor = "var(--rose)";
    boxShadow = "0 0 0 2px var(--rose), 0 0 40px -4px var(--rose)";
  } else if (highlightState === "impacted") {
    borderColor = "var(--amber)";
    boxShadow = "0 0 0 1px var(--amber), 0 0 30px -8px var(--amber)";
  } else if (highlightState === "dim") {
    opacity = 0.35;
  }

  return (
    <div
      onClick={() => onSelect(service.id)}
      className="group rounded-xl transition-all duration-200"
      style={{
        width: 230,
        background: "linear-gradient(180deg, var(--panel) 0%, var(--bg-soft) 100%)",
        border: `1px solid ${borderColor}`,
        boxShadow,
        opacity,
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Top} isConnectable
        style={{ background: "var(--cyan)", width: 10, height: 10, border: "2px solid var(--bg)", top: -5 }} />

      {/* top accent bar keyed to data store */}
      <div style={{ height: 3, background: highlightState === "source" ? "var(--rose)" : highlightState === "impacted" ? "var(--amber)" : `linear-gradient(90deg, ${accent}, transparent)` }} />

      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
          {service.bounded_context.toUpperCase()}
        </span>
        {highlightState === "source" && (
          <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--rose)" }}>● DOWN</span>
        )}
        {highlightState === "impacted" && (
          <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--amber)" }}>impacted</span>
        )}
      </div>

      <div className="px-3.5 pb-1 pt-1.5">
        <div className="text-[15px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
          {service.name}
        </div>
      </div>

      <div className="px-3.5 pb-3 pt-1">
        <p className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--ink-dim)" }}>
          {service.responsibility}
        </p>
      </div>

      <div className="flex items-center justify-between border-t px-3.5 py-2"
        style={{ borderColor: "var(--line-soft)" }}>
        <span className="font-mono text-[10px]" style={{ color: accent }}>
          {service.data_store}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
          {service.key_apis.length} APIs
        </span>
      </div>

      {service.integrations && service.integrations.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3.5 pb-2.5 pt-0.5">
          {service.integrations.slice(0, 3).map((it) => (
            <span key={it} className="rounded px-1.5 py-0.5 font-mono"
              style={{ fontSize: 8.5, background: "rgba(255,255,255,0.04)", border: "1px solid var(--line-soft)", color: "var(--ink-dim)" }}>
              {it}
            </span>
          ))}
          {service.integrations.length > 3 && (
            <span className="font-mono" style={{ fontSize: 8.5, color: "var(--ink-faint)" }}>
              +{service.integrations.length - 3}
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} isConnectable
        style={{ background: "var(--amber)", width: 10, height: 10, border: "2px solid var(--bg)", bottom: -5 }} />
    </div>
  );
}
