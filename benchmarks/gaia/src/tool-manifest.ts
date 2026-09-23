import {
    createToolRegistration,
    type ToolRegistration,
} from "../../../packages/runtime/src/index.js";
import {
    BASH_TOOL_ID,
    READ_FILE_TOOL_ID,
    ReadFileTool,
    WEB_FETCH_TOOL_ID,
    WEB_SEARCH_TOOL_ID,
    WebFetchTool,
    WebSearchTool,
    type WebFetchHandler,
    type WebSearchBackend,
    type WebSearchResult,
} from "../../../packages/tools/src/index.js";
import { compileJsonSchema } from "../../../packages/contracts/src/index.js";
import type { ToolManifestEntry, ToolRpcBackendPort } from "../../src/tool-rpc.js";
import { SUBMIT_ANSWER_TOOL_ID, SubmitAnswerTool } from "./submit-answer.js";
import { GaiaBashTool } from "./bash.js";

/** GAIA 支持的标准工具唯一标识列表。 */
export const GAIA_TOOL_IDS = Object.freeze([
    READ_FILE_TOOL_ID,
    WEB_SEARCH_TOOL_ID,
    WEB_FETCH_TOOL_ID,
    BASH_TOOL_ID,
    SUBMIT_ANSWER_TOOL_ID,
] as const);

/** GAIA 在 review 模式下允许自动放行的只读工具标识列表。 */
export const GAIA_READONLY_TOOL_IDS = Object.freeze([
    READ_FILE_TOOL_ID,
    WEB_SEARCH_TOOL_ID,
    WEB_FETCH_TOOL_ID,
    BASH_TOOL_ID,
] as const);

/**
 * 获取 GAIA 标准沙箱工具的声明元数据清单。
 *
 * @remarks
 * 返回包含 read_file, web_search, web_fetch, bash, submit_answer 五个工具的
 * ID、描述、JSON Schema 及重放策略。
 *
 * @returns 固定的五工具清单数组。
 *
 * @example
 * ```ts
 * const manifest = getGaiaToolManifest();
 * console.log(manifest.map((t) => t.id));
 * ```
 */
export function getGaiaToolManifest(): readonly ToolManifestEntry[] {
    const dummyRoot = "/dummy";
    const tools = [
        new ReadFileTool(dummyRoot),
        new WebSearchTool(async () => []),
        new WebFetchTool(async () => ""),
        new GaiaBashTool(dummyRoot),
        new SubmitAnswerTool({ taskId: "dummy-task" }),
    ];

    return Object.freeze(
        tools.map((t) =>
            Object.freeze({
                id: t.definition.id,
                description: t.definition.description,
                inputSchema: compileJsonSchema(t.definition.inputContract) as Record<string, unknown>,
                replayPolicy: t.replayPolicy,
            }),
        ),
    );
}

/** GAIA 沙箱工具注册工厂配置选项。 */
export interface GaiaToolRegistrationsOptions {
    /** 容器工作区路径，通常为 `/workspace`。 */
    readonly workspaceRoot: string;
    /** 当前任务唯一标识。 */
    readonly taskId: string;
    /** 答案文件落盘路径，默认 `/workspace/answer.json`。 */
    readonly answerFilePath?: string;
    /** 宿主反向代理端口；未配置时直接抛出错误。 */
    readonly backendPort: ToolRpcBackendPort;
    /** 答案提交回调。 */
    readonly onSubmit?: (answer: string) => void;
}

/**
 * 为 GAIA Worker 创建沙箱工具注册项。
 *
 * @remarks
 * 将 `web_search` 和 `web_fetch` 代理至宿主提供的 `ToolRpcBackendPort`。
 * 未配置 backendPort 或 taskId 时在启动期快速失败。
 *
 * @param options - 工作区、任务标识与宿主代理配置。
 * @returns 包含四个标准工具的 ToolRegistration 数组。
 *
 * @example
 * ```ts
 * const tools = createGaiaToolRegistrations({
 *     workspaceRoot: "/workspace",
 *     taskId: "task-1",
 *     backendPort,
 * });
 * ```
 */
export function createGaiaToolRegistrations(
    options: GaiaToolRegistrationsOptions,
): readonly ToolRegistration[] {
    if (!options.backendPort) {
        throw new Error("GAIA Worker tools require a valid backendPort for network tools");
    }
    if (!options.taskId || options.taskId.trim().length === 0) {
        throw new Error("GAIA Worker tools require a non-empty taskId");
    }

    const searchBackend: WebSearchBackend = async (query, maxResults, control) => {
        const result = await options.backendPort.call("web_search", { query, maxResults });
        return result as readonly WebSearchResult[];
    };

    const fetchHandler: WebFetchHandler = async (url, control) => {
        const result = await options.backendPort.call("web_fetch", { url });
        return result as string;
    };

    const submitAnswerTool = new SubmitAnswerTool({
        taskId: options.taskId,
        ...(options.answerFilePath !== undefined ? { answerFilePath: options.answerFilePath } : {}),
        ...(options.onSubmit !== undefined ? { onSubmit: options.onSubmit } : {}),
    });

    return [
        createToolRegistration(new ReadFileTool(options.workspaceRoot)),
        createToolRegistration(new WebSearchTool(searchBackend)),
        createToolRegistration(new WebFetchTool(fetchHandler)),
        createToolRegistration(new GaiaBashTool(options.workspaceRoot)),
        createToolRegistration(submitAnswerTool),
    ];
}
