export default function SessionDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:py-8">
      {/* Back button skeleton */}
      <div className="h-5 w-20 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-4" />

      {/* Title skeleton */}
      <div className="h-7 w-3/4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-3" />

      {/* Club + venue name */}
      <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-2" />

      {/* Date + time */}
      <div className="h-4 w-64 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-4" />

      {/* Score badges */}
      <div className="flex gap-2 mb-4">
        <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      {/* Fill rate bar */}
      <div className="h-6 w-full rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse mb-3" />

      {/* Price */}
      <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-5" />

      {/* Score breakdown */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
            <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
          </div>
        ))}
      </div>

      {/* CTA buttons */}
      <div className="mt-6 space-y-2">
        <div className="h-12 w-full rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-12 w-full rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
  );
}
