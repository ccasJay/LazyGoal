import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN_WIDTH = 200;
const DEFAULT_WIDTH = 240;
const viewportMaxWidth = () => Math.max(MIN_WIDTH, Math.min(420, window.innerWidth - 480));

/**
 * 桌面侧栏的页面内宽度控制；隐藏后保留宽度，不持久化到服务端或浏览器存储。
 *
 * @example
 * ```tsx
 * <ResizableSidebar hidden={collapsed}>{navigation}</ResizableSidebar>
 * ```
 */
export function ResizableSidebar({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_WIDTH);
  const [maxWidth, setMaxWidth] = useState(viewportMaxWidth);
  const [resizing, setResizing] = useState(false);
  const gesture = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const width = Math.min(preferredWidth, maxWidth);
  const updateWidth = (next: number) => setPreferredWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, next)));
  const endResize = () => { gesture.current = null; setResizing(false); };

  useEffect(() => {
    const onResize = () => setMaxWidth(viewportMaxWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <aside className={`workspace-sidebar${resizing ? " is-resizing" : ""}`} aria-label="Workspace navigation" hidden={hidden} style={{ width }}>
      {children}
      <div
        className="sidebar-resize-handle"
        role="separator"
        tabIndex={0}
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-controls="workspace-navigation"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        aria-valuetext={`${width} pixels`}
        title="Drag to resize. Use arrow keys to adjust. Double-click to reset."
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { pointerId: event.pointerId, x: event.clientX, width };
          setResizing(true);
        }}
        onPointerMove={event => {
          const start = gesture.current;
          if (start?.pointerId === event.pointerId) updateWidth(start.width + event.clientX - start.x);
        }}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
        onDoubleClick={() => updateWidth(DEFAULT_WIDTH)}
        onKeyDown={event => {
          const step = event.shiftKey ? 40 : 10;
          const next = event.key === "ArrowLeft" ? width - step
            : event.key === "ArrowRight" ? width + step
            : event.key === "Home" ? MIN_WIDTH
            : event.key === "End" ? maxWidth : undefined;
          if (next === undefined) return;
          event.preventDefault();
          updateWidth(next);
        }}
      />
    </aside>
  );
}
