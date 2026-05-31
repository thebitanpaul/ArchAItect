import { useState, type ReactNode } from "react";

export interface InfoContent {
  summary?: string;
  bullets?: { term: string; desc: string }[];
  formula?: string;
}

// Small "i" badge that reveals a well-formatted explanatory card on hover.
// Accepts either a plain string or structured content (summary + bullets +
// formula) for readable, professional tooltips.
export default function InfoDot({
  text,
  content,
  align = "right",
}: {
  text?: string;
  content?: InfoContent;
  align?: "left" | "right";
}) {
  const [show, setShow] = useState(false);

  let body: ReactNode;
  if (content) {
    body = (
      <div className="space-y-2">
        {content.summary && <p style={{ color: "var(--ink-dim)" }}>{content.summary}</p>}
        {content.bullets && content.bullets.length > 0 && (
          <ul className="space-y-1.5">
            {content.bullets.map((b, i) => (
              <li key={i} className="flex gap-1.5">
                <span style={{ color: "var(--cyan)" }}>•</span>
                <span style={{ color: "var(--ink-dim)" }}>
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{b.term}</span>
                  {" — "}{b.desc}
                </span>
              </li>
            ))}
          </ul>
        )}
        {content.formula && (
          <div className="rounded-md px-2 py-1.5"
            style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
            <span className="font-mono text-[10px]" style={{ color: "var(--amber)" }}>{content.formula}</span>
          </div>
        )}
      </div>
    );
  } else {
    body = <span style={{ color: "var(--ink-dim)" }}>{text}</span>;
  }

  return (
    <span className="relative inline-flex">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full font-mono"
        style={{ border: "1px solid var(--line)", color: "var(--ink-faint)", fontSize: 8 }}
      >
        i
      </span>
      {show && (
        <span
          className="absolute top-5 z-30 block rounded-lg p-3 text-[11px] font-normal leading-relaxed"
          style={{
            [align]: 0,
            width: 380,
            maxWidth: "min(380px, 82vw)",
            background: "var(--panel-2)",
            border: "1px solid var(--line)",
            boxShadow: "0 12px 36px -10px rgba(0,0,0,0.85)",
            fontFamily: "Sora, sans-serif",
          } as React.CSSProperties}
        >
          {body}
        </span>
      )}
    </span>
  );
}
