"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-resize width for a side panel, persisted to localStorage.
 *
 * `side` is the edge the drag handle sits on:
 *  - "right": handle on the panel's right edge (the left sidebar) — dragging
 *    right widens it.
 *  - "left": handle on the panel's left edge (right-docked Task Details / Chat)
 *    — dragging left widens it, so the delta is negated.
 *
 * Returns the current `width`, a `dragging` flag (for handle styling), and
 * `handleProps` to spread onto a thin handle element. The handle uses Pointer
 * Events + pointer capture so a drag keeps tracking even when the cursor leaves
 * the strip (and works for mouse + touch uniformly).
 */
export function useResizableWidth(opts: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  side: "left" | "right";
}) {
  const { storageKey, defaultWidth, min, max, side } = opts;

  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, w)), [min, max]);

  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  // Mirror width in a ref so pointer handlers read the live value without
  // being re-created on every pixel of movement (and avoid stale closures).
  const widthRef = useRef(width);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const apply = useCallback(
    (w: number) => {
      const c = clamp(w);
      widthRef.current = c;
      setWidth(c);
    },
    [clamp],
  );

  // Restore a persisted width on mount (clamped to the current bounds).
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n)) apply(n);
    }
  }, [storageKey, apply]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      apply(dragRef.current.startW + (side === "left" ? -dx : dx));
    },
    [apply, side],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may already be released */
      }
      localStorage.setItem(storageKey, String(widthRef.current));
    },
    [storageKey],
  );

  return {
    width,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
