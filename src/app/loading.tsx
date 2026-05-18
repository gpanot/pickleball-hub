import { SessionCardSkeleton } from "@/components/SessionCardSkeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-2 pt-4 sm:px-6 lg:px-8">
      {/* Hero stats skeleton */}
      <div className="mb-4 sm:mb-6">
        <div className="mb-1 hidden sm:block h-7 w-64 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-4 w-80 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mt-2" />
      </div>

      {/* Recommended for you skeleton */}
      <div className="mb-4">
        <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-3" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[min(280px,calc(100vw-3rem))] shrink-0">
              <SessionCardSkeleton />
            </div>
          ))}
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse"
            style={{ width: `${60 + i * 20}px` }}
          />
        ))}
      </div>

      {/* View mode + day tabs skeleton */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-10 w-16 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-10 w-16 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-800" />
        <div className="h-10 w-32 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      {/* Session cards skeleton */}
      <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SessionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
