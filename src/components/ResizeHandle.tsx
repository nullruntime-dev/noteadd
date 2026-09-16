import { useCallback, useEffect, useRef, useState } from "react"
import clsx from "clsx"

interface Props {
  /** "col" = drag horizontally (resizes width), "row" = drag vertically (resizes height). */
  direction: "col" | "row"
  ariaLabel: string
  /** Called on each pointer move while dragging (clientX for "col", clientY for "row"). */
  onDrag: (clientPos: number) => void
  /** Called once when dragging ends — persist the value here. */
  onDragEnd: () => void
  /** Double-click reset. */
  onReset: () => void
  /** Keyboard adjust: -1 = left/up, +1 = right/down. */
  onKeyAdjust: (dir: -1 | 1) => void
  /** Sizing/border classes for the handle strip (width, borders…). */
  className?: string
}

/**
 * Draggable separator strip (role="separator"). Owns the drag mechanics and
 * pointer capture; the parent owns the value (state, clamping, persistence).
 */
export function ResizeHandle({
  direction,
  ariaLabel,
  onDrag,
  onDragEnd,
  onReset,
  onKeyAdjust,
  className,
}: Props) {
  const [resizing, setResizing] = useState(false)
  const resizingRef = useRef(false)

  // Keep latest callbacks without re-attaching the window listeners every render.
  const onDragRef = useRef(onDrag)
  const onDragEndRef = useRef(onDragEnd)
  useEffect(() => {
    onDragRef.current = onDrag
    onDragEndRef.current = onDragEnd
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      resizingRef.current = true
      setResizing(true)
      document.body.style.cursor = direction === "col" ? "col-resize" : "row-resize"
      document.body.style.userSelect = "none"
    },
    [direction],
  )

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!resizingRef.current) return
      onDragRef.current(direction === "col" ? e.clientX : e.clientY)
    }
    const up = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      setResizing(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      onDragEndRef.current()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [direction])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const dec = direction === "col" ? "ArrowLeft" : "ArrowUp"
      const inc = direction === "col" ? "ArrowRight" : "ArrowDown"
      if (e.key !== dec && e.key !== inc) return
      e.preventDefault()
      onKeyAdjust(e.key === inc ? 1 : -1)
    },
    [direction, onKeyAdjust],
  )

  return (
    <div
      role="separator"
      aria-orientation={direction === "col" ? "vertical" : "horizontal"}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="Drag to resize (double-click to reset)"
      className={clsx(
        "flex-shrink-0 select-none transition-colors",
        direction === "col" ? "cursor-col-resize" : "cursor-row-resize",
        resizing ? "bg-[#7aa2f7]" : "bg-transparent hover:bg-[#7aa2f780]",
        className,
      )}
    />
  )
}