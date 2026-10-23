/**
 * Loading placeholders.
 *
 * These are sized to match the content they replace so the page does not jump
 * when real data streams in, and they are hidden from assistive tech — a screen
 * reader should hear that something is loading, not read a pile of empty boxes.
 */

function Bar({ className }: { className: string }) {
  return <div className={`skeleton rounded ${className}`} />;
}

export function BoardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading the board">
      <span className="sr-only">Loading the board…</span>

      <div className="grid gap-5 md:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-card p-6">
            <Bar className="h-10 w-16" />
            <Bar className="mt-5 h-6 w-3/4" />
            <Bar className="mt-3 h-4 w-full" />
            <Bar className="mt-2 h-4 w-5/6" />
            <div className="mt-6 flex items-end justify-between border-t border-white/8 pt-4">
              <Bar className="h-4 w-20" />
              <Bar className="h-7 w-24" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="glass flex items-center gap-5 rounded-card p-5"
          >
            <Bar className="h-8 w-10" />
            <div className="flex-1">
              <Bar className="h-5 w-1/3" />
              <Bar className="mt-2.5 h-4 w-2/3" />
            </div>
            <Bar className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PodiumSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the podium"
      className="flex items-end justify-center gap-4 sm:gap-6"
    >
      <span className="sr-only">Loading the podium…</span>
      <div className="skeleton h-24 w-28 rounded-t-lg sm:h-32 sm:w-48" />
      <div className="skeleton h-40 w-28 rounded-t-lg sm:h-52 sm:w-48" />
      <div className="skeleton h-16 w-28 rounded-t-lg sm:h-24 sm:w-48" />
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="glass rounded-card p-5">
      <span className="sr-only">Loading…</span>
      <Bar className="h-5 w-32" />
      <Bar className="mt-4 h-4 w-full" />
      <Bar className="mt-2 h-4 w-5/6" />
      <Bar className="mt-5 h-10 w-full" />
    </div>
  );
}
