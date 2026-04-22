"use client";

import { formatVND } from "@/lib/utils";

interface PriceTagProps {
  feeAmount: number;
  costPerHour?: number | null;
}

export function PriceTag({ feeAmount, costPerHour }: PriceTagProps) {
  return (
    <div className="flex shrink-0 flex-col items-end text-right">
      <span className="text-sm font-bold tabular-nums leading-tight text-foreground">
        {formatVND(feeAmount)}
      </span>
      {costPerHour != null && costPerHour > 0 && (
        <span className="text-xs tabular-nums text-muted">
          {formatVND(costPerHour)}/hr
        </span>
      )}
    </div>
  );
}
