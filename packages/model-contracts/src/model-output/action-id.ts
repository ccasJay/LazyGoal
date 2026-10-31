let businessActionCounter = 0;

/**
 * 生成一次业务工具调用的本地 Action 身份。
 *
 * @remarks
 * 身份只用于模型原生调用缺失 Runtime Action ID 时的占位；包含工具 ID、时间与进程内
 * 单调计数，不承载授权或持久化身份。Runtime 可在原生路径覆盖它。
 *
 * @param toolId - 被调用的业务工具 ID。
 * @returns 形如 `action-<toolId>-<time>-<counter>` 的稳定格式字符串。
 * @example
 * ```ts
 * const actionId = generateBusinessActionId("read_file");
 * ```
 */
export function generateBusinessActionId(toolId: string): string {
    businessActionCounter = (businessActionCounter + 1) % 1_000_000;
    return `action-${toolId}-${Date.now().toString(36)}-${businessActionCounter}`;
}
