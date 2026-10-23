import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并组件类名，并使调用方的 Tailwind 工具类覆盖默认变体。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
