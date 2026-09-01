import type { GoalMessage, ModelContextEpochState } from "./domain";
import type { EpochRange } from "./trajectory";

/** Context Epoch 运行时校验失败的稳定错误码。 */
export const MODEL_CONTEXT_CHECKPOINT_INVALID = "MODEL_CONTEXT_CHECKPOINT_INVALID" as const;

/** Epoch 检查点协议或边界非法时抛出的错误。 */
export class ModelContextCheckpointError extends Error {
    readonly code = MODEL_CONTEXT_CHECKPOINT_INVALID;
    constructor(message: string) {
        super(`${MODEL_CONTEXT_CHECKPOINT_INVALID}: ${message}`);
        this.name = "ModelContextCheckpointError";
    }
}

/** 创建新 Goal 的初始 Epoch。 */
export function createInitialContextEpoch(): ModelContextEpochState {
    return Object.freeze({
        version: 1 as const,
        number: 0,
        conversationStartIndex: 0,
        openedAtSequence: 0,
    });
}

/** 将当前 Epoch 投影为可写 Trajectory 范围。 */
export function toEpochRange(
    epoch: ModelContextEpochState,
    conversationLength: number,
    closedThroughSequence: number,
): EpochRange {
    assertEpoch(epoch);
    if (!Number.isSafeInteger(conversationLength) || conversationLength < epoch.conversationStartIndex) {
        throw new ModelContextCheckpointError("conversation length is outside epoch range");
    }
    if (!Number.isSafeInteger(closedThroughSequence) || closedThroughSequence < 0) {
        throw new ModelContextCheckpointError("closedThroughSequence is invalid");
    }
    return Object.freeze({
        number: epoch.number,
        conversationStartIndex: epoch.conversationStartIndex,
        conversationEndIndexExclusive: conversationLength,
        closedThroughSequence,
    });
}

/** 基于完整消息边界打开下一个 Epoch。 */
export function advanceContextEpoch(
    current: ModelContextEpochState,
    messages: readonly GoalMessage[],
    newStartIndex: number,
    openedAtSequence: number,
): ModelContextEpochState {
    assertEpoch(current);
    if (!Array.isArray(messages)) throw new ModelContextCheckpointError("messages must be an array");
    if (!Number.isSafeInteger(newStartIndex) || newStartIndex < current.conversationStartIndex || (messages.length > 0 && newStartIndex >= messages.length)) {
        throw new ModelContextCheckpointError("new Epoch must retain at least one complete message");
    }
    if (!Number.isSafeInteger(openedAtSequence) || openedAtSequence < 0) {
        throw new ModelContextCheckpointError("openedAtSequence is invalid");
    }
    return Object.freeze({
        version: 1 as const,
        number: current.number + 1,
        conversationStartIndex: newStartIndex,
        openedAtSequence,
    });
}

/** 选择满足压力阈值的最大最新后缀起点。 */
export function selectEpochConversationStart(
    units: readonly { readonly startIndex: number; readonly endIndexExclusive: number; readonly tokens: number }[],
    pressureLimit: number,
): number {
    if (!Number.isSafeInteger(pressureLimit) || pressureLimit <= 0) {
        throw new ModelContextCheckpointError("pressureLimit is invalid");
    }
    let total = 0;
    let start = units.length > 0 ? units[units.length - 1]!.startIndex : 0;
    for (let index = units.length - 1; index >= 0; index -= 1) {
        const unit = units[index]!;
        if (!Number.isSafeInteger(unit.tokens) || unit.tokens < 0) {
            throw new ModelContextCheckpointError("conversation unit tokens are invalid");
        }
        if (total + unit.tokens > pressureLimit && index < units.length - 1) break;
        total += unit.tokens;
        start = unit.startIndex;
    }
    return start;
}

/** 选择当前完整 Conversation 后缀的合法起点，避免从 assistant 中间切入。 */
export function selectLatestConversationStart(
    messages: readonly GoalMessage[],
    minimumStartIndex = 0,
): number {
    if (!Array.isArray(messages)) throw new ModelContextCheckpointError("messages must be an array");
    if (!Number.isSafeInteger(minimumStartIndex) || minimumStartIndex < 0) {
        throw new ModelContextCheckpointError("minimumStartIndex is invalid");
    }
    if (messages.length === 0) return 0;
    let index = Math.min(messages.length - 1, Math.max(0, minimumStartIndex));
    while (index > minimumStartIndex && messages[index]?.role !== "user") index -= 1;
    if (messages[index]?.role !== "user") {
        // 当前 Epoch 起点本身应已是完整单元边界；若没有 user，保守地保留它。
        return Math.min(messages.length - 1, minimumStartIndex);
    }
    return index;
}

function assertEpoch(epoch: ModelContextEpochState): void {
    if (
        !epoch || epoch.version !== 1
        || !Number.isSafeInteger(epoch.number) || epoch.number < 0
        || !Number.isSafeInteger(epoch.conversationStartIndex) || epoch.conversationStartIndex < 0
        || !Number.isSafeInteger(epoch.openedAtSequence) || epoch.openedAtSequence < 0
    ) {
        throw new ModelContextCheckpointError("Epoch state is invalid");
    }
}
