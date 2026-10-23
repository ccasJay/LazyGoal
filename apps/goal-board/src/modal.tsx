import { useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "./components/ui/dialog";

/**
 * 组合 shadcn Dialog；焦点隔离、Escape 和关闭后焦点恢复由 Radix 管理。
 *
 * @remarks 子元素可用 `data-modal-autofocus` 指定初始焦点；这里只管理页面状态，不持久化用户选择。
 *
 * @example
 * ```tsx
 * <Modal label="Choose model" className="model-picker" onClose={close}>…</Modal>
 * ```
 */
export function Modal({ label, className, onClose, children }: { label: string; className: string; onClose: () => void; children: ReactNode }) {
  const opener = useRef(typeof document === "undefined" ? null : document.activeElement);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className={className} aria-describedby={undefined} onCloseAutoFocus={event => {
      event.preventDefault();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    }} onOpenAutoFocus={event => {
      const target = event.currentTarget as HTMLElement;
      const preferred = target.querySelector<HTMLElement>("[data-modal-autofocus]");
      if (preferred) { event.preventDefault(); preferred.focus(); }
    }}>
      <DialogTitle className="sr-only">{label}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}
