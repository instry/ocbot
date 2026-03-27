/**
 * Invisible titlebar region for macOS window dragging.
 * Sits atop all content; interactive elements use `no-drag` to remain clickable.
 */
export function Titlebar() {
  return (
    <div className="drag-region pointer-events-none fixed inset-x-0 top-0 z-50 h-[var(--titlebar-height)]" />
  )
}
