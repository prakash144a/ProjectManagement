"use client";

import type { CSSProperties } from "react";
import type { useResizableWidth } from "@/lib/useResizableWidth";

/**
 * A thin drag strip that straddles a panel's left or right border. The parent
 * panel must be `position: relative`. Spread the hook's `handleProps` here.
 */
export function ResizeHandle({
  side,
  dragging,
  handleProps,
}: {
  side: "left" | "right";
  dragging: boolean;
  handleProps: ReturnType<typeof useResizableWidth>["handleProps"];
}) {
  return (
    <div
      className="resize-handle"
      data-dragging={dragging || undefined}
      style={{ [side]: -4 } as CSSProperties}
      aria-hidden
      {...handleProps}
    />
  );
}
