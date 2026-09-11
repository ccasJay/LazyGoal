import type { ToolPolicy, ToolPolicyContext } from "../../packages/runtime/src/index.js";
import { SWEBENCH_READONLY_TOOL_IDS } from "../swebench/src/tool-manifest.js";
import { GAIA_READONLY_TOOL_IDS } from "../gaia/src/tool-manifest.js";

/** TUI 沙箱执行的授权模式。 */
export type TuiExecutionMode = "auto" | "review";

/**
 * 双模 ToolPolicy 的构造配置选项。
 *
 * @example
 * ```ts
 * const options: TuiToolPolicyOptions = {
 *     mode: "review",
 *     readonlyToolIds: ["read_file"],
 * };
 * ```
 */
export interface TuiToolPolicyOptions {
    /** 执行模式：auto 自动放行授权工具；review 则仅自动放行只读白名单工具。 */
    readonly mode: TuiExecutionMode;
    /** review 模式下自动放行的只读工具 ID 列表。 */
    readonly readonlyToolIds?: readonly string[];
}

/**
 * 构造用于 TUI 沙箱运行时的双模 ToolPolicy。
 *
 * @remarks
 * - auto 模式：全部合法授权工具自动放行（"allow"）；
 * - review 模式：仅在 readonlyToolIds 中的只读工具自动放行，其余工具（包括 bash、写文件、编辑文件、提交答案和未知工具）一律返回 "require_approval"；
 * - 绝不根据工具名字前缀启发式猜测，严格根据显式白名单判断。
 *
 * @param options - 包含执行模式与只读工具名单的配置。
 * @returns 满足 Runtime 契约的 ToolPolicy 实例。
 *
 * @example
 * ```ts
 * const policy = createTuiToolPolicy({
 *     mode: "review",
 *     readonlyToolIds: ["read_file", "grep"],
 * });
 * ```
 */
export function createTuiToolPolicy(options: TuiToolPolicyOptions): ToolPolicy {
    const readonlySet = new Set(options.readonlyToolIds ?? []);

    return {
        evaluate(context: ToolPolicyContext): "allow" | "require_approval" {
            if (options.mode === "auto") {
                return "allow";
            }
            if (readonlySet.has(context.tool.id)) {
                return "allow";
            }
            return "require_approval";
        },
    };
}

/**
 * 为 SWE-bench 创建 TUI 工具审批策略。
 *
 * @remarks
 * review 模式下仅自动放行 read_file 和 grep，bash, write_file, edit_file 需要人工审批。
 *
 * @param mode - 执行模式（auto 或 review）。
 * @returns 适配 SWE-bench 规则的 ToolPolicy。
 *
 * @example
 * ```ts
 * const policy = createSwebenchTuiToolPolicy("review");
 * ```
 */
export function createSwebenchTuiToolPolicy(mode: TuiExecutionMode): ToolPolicy {
    return createTuiToolPolicy({
        mode,
        readonlyToolIds: SWEBENCH_READONLY_TOOL_IDS,
    });
}

/**
 * 为 GAIA 创建 TUI 工具审批策略。
 *
 * @remarks
 * review 模式下仅自动放行 read_file, web_search, web_fetch，submit_answer 需要人工审批。
 *
 * @param mode - 执行模式（auto 或 review）。
 * @returns 适配 GAIA 规则的 ToolPolicy。
 *
 * @example
 * ```ts
 * const policy = createGaiaTuiToolPolicy("review");
 * ```
 */
export function createGaiaTuiToolPolicy(mode: TuiExecutionMode): ToolPolicy {
    return createTuiToolPolicy({
        mode,
        readonlyToolIds: GAIA_READONLY_TOOL_IDS,
    });
}
