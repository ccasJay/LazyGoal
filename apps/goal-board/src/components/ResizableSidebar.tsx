import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ResizablePanel, ResizableHandle } from "./ui/resizable";
import { SidebarContent } from "./ui/sidebar";

/**
 * 用 shadcn Resizable 管理桌面侧栏；宽度仅保存在本页，隐藏后保留偏好。
 * @example
 * ```tsx
 * <ResizableSidebar hidden={collapsed}>{navigation}</ResizableSidebar>
 * ```
 */
export function ResizableSidebar({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const panel = useRef<ImperativePanelHandle>(null);
  const preferred = useRef(240);
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const min = 200 / viewport * 100;
  const max = Math.max(200, Math.min(420, viewport - 480)) / viewport * 100;
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (hidden) panel.current?.collapse();
    else panel.current?.resize(Math.max(min, Math.min(max, preferred.current / viewport * 100)));
  }, [hidden, viewport, min, max]);
  return <>
    <ResizablePanel ref={panel} defaultSize={240 / viewport * 100} minSize={min} maxSize={max} collapsible collapsedSize={0}
      onResize={size => { if (size > 0) preferred.current = size / 100 * viewport; }}>
      <aside className="workspace-sidebar" aria-label="Workspace navigation" hidden={hidden}>
        <SidebarContent>{children}</SidebarContent>
      </aside>
    </ResizablePanel>
    <ResizableHandle className={hidden ? "hidden" : "sidebar-resize-handle"} aria-label="Resize sidebar"
      onDoubleClick={() => panel.current?.resize(240 / viewport * 100)}
      onKeyDown={event => {
        const step = event.shiftKey ? 40 : 10;
        const next = event.key === "ArrowLeft" ? preferred.current - step : event.key === "ArrowRight" ? preferred.current + step
          : event.key === "Home" ? 200 : event.key === "End" ? max / 100 * viewport : undefined;
        if (next !== undefined) { event.preventDefault(); panel.current?.resize(Math.max(min, Math.min(max, next / viewport * 100))); }
      }} />
  </>;
}
