export default function HeatmapLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-8 w-72 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-2" />
        <div className="h-4 w-96 max-w-full rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      {/* DUPR slider card skeleton */}
      <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/50 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>

      {/* Time filter pills skeleton */}
      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>

      {/* Map skeleton */}
      <div className="mb-8 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="h-[480px] w-full rounded-xl bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
      </div>

      {/* Sessions section skeleton */}
      <div className="h-6 w-64 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-2" />
      <div className="h-4 w-80 max-w-full rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-4" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="w-72 shrink-0 sm:w-80 h-[200px] rounded-xl bg-gray-100 dark:bg-gray-800/50 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
