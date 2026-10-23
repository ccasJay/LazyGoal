import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/**
 * 把窄屏检查器约束为模态焦点域，并在关闭时把焦点还给打开它的控件。
 *
 * @remarks
 * 宽屏分栏不劫持焦点，只处理 Escape；调用方通过 `modal` 表达当前是否覆盖在记录列表之上。
 * 已由子控件处理的键盘事件（`defaultPrevented`）不再重复处理，避免与时间轴的范围清除冲突。
 *
 * @param open - 检查器是否可见。
 * @param modal - 当前是否为窄屏覆盖布局。
 * @param onClose - 关闭回调；由 ref 持有，不触发键盘监听器重建。
 * @returns 绑定到检查器根元素的 ref。
 *
 * @example
 * ```tsx
 * const ref = useInspectorFocus({ open, modal: narrow, onClose });
 * return <section ref={ref} role={narrow ? "dialog" : undefined}>…</section>;
 * ```
 */
export function useInspectorFocus({ open, modal, onClose }: { open: boolean; modal: boolean; onClose: () => void }): RefObject<HTMLElement | null> {
  const container = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target = opener.current;
      opener.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open || !modal) return;
    const element = container.current;
    if (element === null) return;
    const first = element.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? element).focus({ preventScroll: true });
  }, [open, modal]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (!modal || event.key !== "Tab") return;
      const element = container.current;
      if (element === null) return;
      const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.getClientRects().length > 0);
      if (items.length === 0) {
        event.preventDefault();
        element.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      const active = document.activeElement;
      if (!element.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, modal]);

  return container;
}
