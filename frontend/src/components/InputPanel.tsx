import { useRef, useState } from "react";
import { Upload, Network } from "lucide-react";
import { extractText } from "@/lib/api";
const SAMPLE = `Build an online food delivery platform. Customers browse restaurants and menus, place orders, pay online, and track delivery in real time. Restaurants manage their menus and accept or reject incoming orders. Delivery drivers receive assignments and update delivery status. Admins oversee the platform, handle disputes, and view analytics on orders and revenue.`;
interface Props {
  onRun: (doc: string) => void;
  running: boolean;
}
export default function InputPanel({ onRun, running }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const extracted = await extractText(file);
      setText(extracted);
    } catch {
      setFileName(`${file.name} (failed to read)`);
    }
  }
  return (
    <div className="panel panel-glow p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="font-mono text-xs tracking-wider"
          style={{ color: "var(--ink-dim)" }}
        >
          REQUIREMENTS INPUT
        </span>
        <button
          onClick={() => setText(SAMPLE)}
          className="tag ml-auto"
          style={{ cursor: "pointer" }}
        >
          Load Sample
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your software requirements here, or upload a file below..."
        className="h-44 w-full resize-none rounded-lg p-3.5 text-sm outline-none"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line)",
          color: "var(--ink)",
          fontFamily: "Sora, sans-serif",
          lineHeight: 1.6,
        }}
      />
      <div className="mt-3 flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.pdf"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition-colors"
          style={{
            border: "1px solid var(--line)",
            color: "var(--ink-dim)",
            cursor: "pointer",
          }}
        >
          <Upload size={14} />
          Upload .pdf / .txt / .md
        </button>
        {fileName && (
          <span
            className="truncate font-mono text-[10px]"
            style={{ color: "var(--ink-faint)" }}
          >
            {fileName}
          </span>
        )}
        <button
          onClick={() => onRun(text)}
          disabled={running || text.trim().length < 30}
          className="ml-auto flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all"
          style={{
            background:
              running || text.trim().length < 30
                ? "var(--panel-2)"
                : "var(--amber)",
            color:
              running || text.trim().length < 30
                ? "var(--ink-faint)"
                : "#1a1205",
            cursor:
              running || text.trim().length < 30
                ? "not-allowed"
                : "pointer",
            boxShadow:
              running || text.trim().length < 30
                ? "none"
                : "0 0 24px -6px var(--glow-amber)",
          }}
        >
          <Network size={16} />
          {running ? "Analyzing..." : "Identify Microservices"}
        </button>
      </div>
    </div>
  );
}
