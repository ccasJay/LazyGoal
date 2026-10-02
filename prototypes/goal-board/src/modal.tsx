import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * 使用浏览器原生模态层管理焦点、Escape 与背景隔离；卸载时恢复打开前的焦点。
 *
 * @remarks 子元素可用 `data-modal-autofocus` 指定初始焦点；这里只管理页面状态，不持久化用户选择。
 *
 * @example
 * ```tsx
 * <Modal label="Choose model" className="model-picker" onClose={close}>…</Modal>
 * ```
 */
export function Modal({ label, className, onClose, children }: { label: string; className: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLElement>("[data-modal-autofocus]")?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className={className} aria-label={label}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>{children}</dialog>;
}
