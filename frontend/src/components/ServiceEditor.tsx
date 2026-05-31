import { useState } from "react";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import type { Service } from "@/types/architecture";

interface Props {
  services: Service[];
  onChange: (services: Service[]) => void;
  busy: boolean;
}

/** Lightweight add/delete/rename editor. Keeps it simple: rename edits the
 *  service name + responsibility; add creates a stub; delete removes. The
 *  caller re-runs dependency + resilience analysis after applying. */
export default function ServiceEditor({ services, onChange, busy }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftResp, setDraftResp] = useState("");
  const [draftStore, setDraftStore] = useState("");
  const [draftIntegrations, setDraftIntegrations] = useState("");

  const STORE_OPTIONS = [
    "PostgreSQL", "MySQL", "Redis", "MongoDB", "Elasticsearch",
    "Kafka", "Data Warehouse", "Neo4j", "InfluxDB", "Object Storage (S3)",
  ];

  function startEdit(s: Service) {
    setEditingId(s.id);
    setDraftName(s.name);
    setDraftResp(s.responsibility);
    setDraftStore(s.data_store || "PostgreSQL");
    setDraftIntegrations((s.integrations || []).join(", "));
  }
  function saveEdit() {
    const integrations = draftIntegrations.split(",").map((x) => x.trim()).filter(Boolean);
    onChange(services.map((s) =>
      s.id === editingId
        ? { ...s, name: draftName, responsibility: draftResp, data_store: draftStore, integrations }
        : s
    ));
    setEditingId(null);
  }
  function remove(id: string) {
    onChange(services.filter((s) => s.id !== id));
  }
  function add() {
    const n = services.length + 1;
    const stub: Service = {
      id: `new-service-${n}`,
      name: `New Service ${n}`,
      responsibility: "Describe this service's single responsibility.",
      bounded_context: "Custom",
      owns_entities: [],
      key_apis: [],
      data_store: "PostgreSQL",
      integrations: [],
      rationale: "Added manually by the architect.",
    };
    onChange([...services, stub]);
    startEdit(stub);
  }

  return (
    <div className="panel panel-glow overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <Pencil size={13} style={{ color: "var(--cyan)" }} />
        <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-faint)" }}>
          EDIT SERVICES
        </span>
        <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
          — your design; re-analyze when ready
        </span>
        <button onClick={add} disabled={busy}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px]"
          style={{ border: "1px solid var(--cyan)", color: "var(--cyan)", cursor: busy ? "wait" : "pointer", background: "rgba(56,225,212,0.08)" }}>
          <Plus size={11} /> add
        </button>
      </div>

      <div className="max-h-[420px] space-y-1.5 overflow-y-auto p-3">
        {services.map((s) => (
          <div key={s.id} className="rounded-lg p-2.5"
            style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
            {editingId === s.id ? (
              <div className="space-y-2">
                <input value={draftName} onChange={(e) => setDraftName(e.target.value)}
                  className="w-full rounded px-2 py-1 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }} />
                <textarea value={draftResp} onChange={(e) => setDraftResp(e.target.value)} rows={2}
                  className="w-full resize-none rounded px-2 py-1 text-[12px] outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink-dim)" }} />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>store:</span>
                  <select value={draftStore} onChange={(e) => setDraftStore(e.target.value)}
                    className="flex-1 rounded px-2 py-1 text-[12px] outline-none"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                    {STORE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    {!STORE_OPTIONS.includes(draftStore) && <option value={draftStore}>{draftStore}</option>}
                  </select>
                </div>
                <div>
                  <span className="mb-1 block font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                    integrations (comma-separated — e.g. Stripe, Auth0, SendGrid, S3):
                  </span>
                  <input value={draftIntegrations} onChange={(e) => setDraftIntegrations(e.target.value)}
                    placeholder="Stripe (payments), Auth0 (identity)…"
                    className="w-full rounded px-2 py-1 text-[12px] outline-none"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }} />
                </div>
                <div className="flex gap-1.5">
                  <button onClick={saveEdit} className="flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                    style={{ border: "1px solid var(--cyan)", color: "var(--cyan)", cursor: "pointer" }}>
                    <Check size={11} /> save
                  </button>
                  <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                    style={{ border: "1px solid var(--line)", color: "var(--ink-faint)", cursor: "pointer" }}>
                    <X size={11} /> cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.name}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[9px]" style={{ color: "var(--cyan)" }}>{s.data_store}</span>
                    <span className="truncate text-[11px]" style={{ color: "var(--ink-faint)" }}>· {s.responsibility}</span>
                  </div>
                  {s.integrations && s.integrations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.integrations.map((it) => (
                        <span key={it} className="rounded px-1.5 py-0.5 font-mono" style={{ fontSize: 8.5, background: "rgba(255,255,255,0.04)", border: "1px solid var(--line-soft)", color: "var(--ink-dim)" }}>
                          {it}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => startEdit(s)} className="shrink-0 rounded p-1.5" style={{ color: "var(--ink-dim)", cursor: "pointer" }} title="Rename">
                  <Pencil size={12} />
                </button>
                <button onClick={() => remove(s.id)} disabled={busy} className="shrink-0 rounded p-1.5" style={{ color: "var(--rose)", cursor: busy ? "wait" : "pointer" }} title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
