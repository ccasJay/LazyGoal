import {
    compileJsonSchema,
    safeParse,
} from "../../packages/contracts/src/index.js";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    throwIfAborted,
    type ExecutionControl,
    type JsonValue,
    type ToolDefinition,
    type ToolObservation,
    type ToolRegistration,
    type ToolRegistry,
} from "../../packages/runtime/src/index.js";
import {
    BashTool,
    EditFileTool,
    GrepTool,
    ReadFileTool,
    WriteFileTool,
    WebFetchTool,
    WebSearchTool,
} from "../../packages/tools/src/index.js";
import { SubmitAnswerTool } from "../gaia/src/submit-answer.js";
import type { ToolRpcClient } from "./tool-rpc.js";

/** 远程工具代理的配置选项。 */
export interface RemoteToolRegistrationOptions {
    /** 绑定的跨进程工具 RPC 客户端。 */
    readonly client: ToolRpcClient;
    /** 工具的静态定义契约。 */
    readonly definition: ToolDefinition;
    /** 进程中断后对未完成 Action 的重放策略。 */
    readonly replayPolicy: "safe" | "manual";
}

/**
 * 创建一个将执行请求代理给远端 Worker 的 ToolRegistration。
 *
 * @remarks
 * `prepare` 阶段仅在宿主本地执行输入契约解析与语法校验，不向 Worker 发送任何网络或 RPC 消息。
 * 只有当 Runtime 调度并显式执行 `execute` 闭包时，才通过 `ToolRpcClient` 发送一次性远程调用。
 *
 * @param options - 包含 RPC 客户端与静态工具定义的配置。
 * @returns 兼容 Runtime 的类型擦除工具注册项。
 *
 * @example
 * ```ts
 * const remoteRegistration = createRemoteToolRegistration({
 *     client,
 *     definition: readFileTool.definition,
 *     replayPolicy: "safe",
 * });
 * ```
 */
export function createRemoteToolRegistration(
    options: RemoteToolRegistrationOptions,
): ToolRegistration {
    compileJsonSchema(options.definition.inputContract);

    return {
        definition: options.definition,
        replayPolicy: options.replayPolicy,
        prepare(input: JsonValue, control?: ExecutionControl) {
            throwIfAborted(control);
            const parsed = safeParse(options.definition.inputContract, input);
            throwIfAborted(control);

            if (!parsed.success) {
                const issue = parsed.issues[0];
                const path = issue === undefined ? "$" : issue.path.join(".");
                return {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: `${options.definition.id} 输入 Contract 校验失败：${issue?.code ?? "unknown"} at ${path}`,
                    },
                };
            }

            return {
                ok: true,
                input: parsed.data as JsonValue,
                async execute(actionId: string, execControl?: ExecutionControl): Promise<ToolObservation> {
                    throwIfAborted(execControl);
                    return await options.client.execute({
                        actionId,
                        toolId: options.definition.id,
                        input: parsed.data,
                        control: execControl,
                    });
                },
            };
        },
    };
}

/**
 * 为 SWE-bench 创建完整的远程代理 ToolRegistry。
 *
 * @remarks
 * 包含 read_file, write_file, edit_file, grep, bash 五个工具的代理绑定。
 *
 * @param client - 绑定的工具 RPC 客户端。
 * @returns 包含五个远程代理工具的 InMemoryToolRegistry。
 *
 * @example
 * ```ts
 * const registry = createSwebenchRemoteToolRegistry(client);
 * ```
 */
export function createSwebenchRemoteToolRegistry(client: ToolRpcClient): InMemoryToolRegistry {
    const dummyRoot = "/dummy";
    const tools = [
        new ReadFileTool(dummyRoot),
        new WriteFileTool(dummyRoot),
        new EditFileTool(dummyRoot),
        new GrepTool(dummyRoot),
        new BashTool(dummyRoot),
    ];

    return new InMemoryToolRegistry(
        tools.map((tool) =>
            createRemoteToolRegistration({
                client,
                definition: tool.definition,
                replayPolicy: tool.replayPolicy,
            }),
        ),
    );
}

/**
 * 为 GAIA 创建完整的远程代理 ToolRegistry。
 *
 * @remarks
 * 包含 read_file, web_search, web_fetch, submit_answer 四个工具的代理绑定。
 *
 * @param client - 绑定的工具 RPC 客户端。
 * @returns 包含四个远程代理工具的 InMemoryToolRegistry。
 *
 * @example
 * ```ts
 * const registry = createGaiaRemoteToolRegistry(client);
 * ```
 */
export function createGaiaRemoteToolRegistry(client: ToolRpcClient): InMemoryToolRegistry {
    const dummyRoot = "/dummy";
    const tools = [
        new ReadFileTool(dummyRoot),
        new WebSearchTool(async () => []),
        new WebFetchTool(async () => ""),
        new SubmitAnswerTool({ taskId: "dummy" }),
    ];

    return new InMemoryToolRegistry(
        tools.map((tool) =>
            createRemoteToolRegistration({
                client,
                definition: tool.definition,
                replayPolicy: tool.replayPolicy,
            }),
        ),
    );
}
