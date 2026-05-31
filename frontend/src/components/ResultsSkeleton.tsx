// Skeleton shown while the pipeline runs, so the page has structure
// (not just an empty void) until the real architecture arrives.

function Shimmer({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ background: "var(--panel-2)", ...style }}
    >
      <div className="skeleton-sweep absolute inset-0" />
    </div>
  );
}

export default function ResultsSkeleton() {
  return (
    <div className="mt-5 animate-[fadeIn_0.3s_ease]">
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
        .skeleton-sweep {
          background: linear-gradient(90deg, transparent, rgba(56,225,212,0.10), transparent);
          animation: sweep 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* summary strip skeleton */}
      <div className="panel mb-5 flex flex-wrap items-center gap-6 px-5 py-4">
        <div className="space-y-2">
          <Shimmer className="h-2.5 w-12" />
          <Shimmer className="h-4 w-32" />
        </div>
        <div className="h-8 w-px" style={{ background: "var(--line)" }} />
        <div className="flex gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Shimmer className="h-5 w-8" />
              <Shimmer className="h-2 w-14" />
            </div>
          ))}
        </div>
        <div className="ml-auto hidden space-y-1.5 lg:block">
          <Shimmer className="h-2.5 w-72" />
          <Shimmer className="h-2.5 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        {/* map skeleton with floating node placeholders */}
        <div className="panel panel-glow relative overflow-hidden" style={{ height: 560 }}>
          <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--line)" }}>
            <Shimmer className="h-2.5 w-20" />
          </div>
          <div className="relative h-[calc(100%-41px)]">
            {/* faux nodes positioned like a graph */}
            {[
              { x: "38%", y: "12%" }, { x: "16%", y: "42%" }, { x: "60%", y: "40%" },
              { x: "30%", y: "70%" }, { x: "68%", y: "72%" },
            ].map((p, i) => (
              <div key={i} className="absolute" style={{ left: p.x, top: p.y, animationDelay: `${i * 0.12}s` }}>
                <Shimmer className="h-[92px] w-[210px]" style={{ borderRadius: 12, border: "1px solid var(--line)" }} />
              </div>
            ))}
          </div>
        </div>

        {/* competitor skeleton */}
        <div className="panel panel-glow p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <Shimmer className="h-7 w-7" style={{ borderRadius: 8 }} />
            <div className="space-y-1.5">
              <Shimmer className="h-2 w-28" />
              <Shimmer className="h-3.5 w-40" />
            </div>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mb-2.5 space-y-2 rounded-lg p-3" style={{ background: "var(--bg)", border: "1px solid var(--line-soft)" }}>
              <Shimmer className="h-3 w-32" />
              <Shimmer className="h-2.5 w-full" />
              <Shimmer className="h-2.5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
