"use client";

import { useEffect, useState } from "react";

/** Matches preview bottom sheet breakpoint (under 768px). */
export const BOOK_PREVIEW_MAX_PX = 767;

export function useIsBookPreviewViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BOOK_PREVIEW_MAX_PX}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}
