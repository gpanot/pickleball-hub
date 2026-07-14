"use client";

import { useEffect } from "react";

export default function HeatmapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[heatmap/error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-6 py-10">
        <h2 className="mb-2 text-lg font-bold text-red-700 dark:text-red-400">
          Heatmap failed to load
        </h2>
        <p className="mb-1 text-sm text-red-600 dark:text-red-300">
          {error.message || "An unexpected error occurred while loading the heatmap."}
        </p>
        {error.digest && (
          <p className="mb-4 text-xs text-red-500/70 dark:text-red-400/60 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-red-500 dark:text-red-400 select-none">
            Technical details
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-red-100 dark:bg-red-900/40 p-3 text-[11px] text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
            {error.stack ?? error.message}
          </pre>
        </details>
        <button
          onClick={reset}
          className="rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 px-4 py-2 text-sm font-semibold text-white transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
