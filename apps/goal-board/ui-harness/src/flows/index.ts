import { sendMessageFlow } from "./send-message";
import { stopOutcomeUnknownFlow } from "./stop-outcome-unknown";
import type { UiFlow } from "./types";

export * from "./types";
export { runFlow } from "./runner";
export { observeFlow } from "./observe";
export type {
  ObservationFrame,
  ObservationFrameFacts,
  ObservationReport,
  ObserveOptions,
} from "./observe";
export { sendMessageFlow } from "./send-message";
export { stopOutcomeUnknownFlow } from "./stop-outcome-unknown";

/** 全部可用流程，按标识索引。 */
export const allFlows: Record<string, UiFlow> = {
  [sendMessageFlow.id]: sendMessageFlow,
  [stopOutcomeUnknownFlow.id]: stopOutcomeUnknownFlow,
};
