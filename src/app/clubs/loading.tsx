export default function ClubsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      {/* Header skeleton */}
      <div className="mb-4 sm:mb-6">
        <div className="h-7 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-2" />
        <div className="h-4 w-64 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      {/* Search + sort skeleton */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="flex-1 h-11 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-11 w-full sm:w-40 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      {/* View mode buttons skeleton */}
      <div className="flex gap-2 mb-4 sm:mb-6">
        <div className="h-10 w-16 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-10 w-16 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      {/* Club cards skeleton */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/50 animate-pulse"
            style={{ height: "180px" }}
          />
        ))}
      </div>
    </div>
  );
}
