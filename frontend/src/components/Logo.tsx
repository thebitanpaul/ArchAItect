// Logo: a requirements "source" node branching into service nodes — a literal
// visual metaphor for what ArchAItect does (decompose specs into services).

export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, rgba(56,225,212,0.15), rgba(255,179,71,0.12))",
        border: "1px solid var(--line)",
        boxShadow: "0 0 24px -8px var(--glow-cyan)",
      }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        {/* connectors */}
        <path d="M12 7 V11 M12 11 H6 V15 M12 11 H18 V15 M12 11 V15"
          stroke="var(--cyan)" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
        {/* source node */}
        <rect x="9" y="3" width="6" height="4" rx="1.4" fill="var(--amber)" />
        {/* service nodes */}
        <rect x="3.5" y="15" width="5" height="4" rx="1.2" fill="var(--cyan)" />
        <rect x="9.5" y="15" width="5" height="4" rx="1.2" fill="var(--cyan)" opacity="0.85" />
        <rect x="15.5" y="15" width="5" height="4" rx="1.2" fill="var(--cyan)" opacity="0.7" />
      </svg>
    </div>
  );
}
