import * as React from "react";
import { cn } from "../../ui-utils";
import { Textarea } from "./textarea";

/**
 * 组合输入控件与附加操作，共用外层边框和聚焦提示。
 * @example
 * ```tsx
 * <InputGroup><InputGroupTextarea /><InputGroupAddon align="block-end">Actions</InputGroupAddon></InputGroup>
 * ```
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-group" role="group" className={cn("input-group", className)} {...props} />;
}

/**
 * 输入组的底部操作区；按钮保持独立的键盘操作，不接管输入焦点。
 * @example
 * ```tsx
 * <InputGroupAddon align="block-end"><Button>Send</Button></InputGroupAddon>
 * ```
 */
function InputGroupAddon({ className, align, ...props }: React.ComponentProps<"div"> & { align: "block-end" }) {
  return <div data-slot="input-group-addon" data-align={align} className={className} {...props} />;
}

/**
 * shadcn Textarea 的输入组版本；聚焦样式归外层容器，保留原生文本框语义。
 * @example
 * ```tsx
 * <InputGroupTextarea aria-label="Message" />
 * ```
 */
function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <Textarea data-slot="input-group-control" className={cn("rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0", className)} {...props} />;
}

export { InputGroup, InputGroupAddon, InputGroupTextarea };
