import { Readable, Writable } from "node:stream";
import { MultiplexedConnection } from "../../src/multiplex.js";
import { ToolRpcServer } from "../../src/tool-rpc.js";
import { createGaiaToolRegistrations } from "./tool-manifest.js";

/** GAIA 独立工具 Worker 的启动选项。 */
export interface GaiaToolsWorkerOptions {
    /** 进程输入流，默认 process.stdin。 */
    readonly input?: ReadableStream<Uint8Array>;
    /** 进程输出流，默认 process.stdout。 */
    readonly output?: WritableStream<Uint8Array>;
    /** 沙箱工作区根目录，默认 `/workspace`。 */
    readonly workspaceRoot?: string;
    /** 当前任务唯一标识。 */
    readonly taskId?: string;
    /** 答案文件路径，默认 `/workspace/answer.json`。 */
    readonly answerFilePath?: string;
    /** 答案提交回调。 */
    readonly onSubmit?: (answer: string) => void;
}

/**
 * 启动 GAIA 沙箱工具 Worker 服务。
 *
 * @remarks
 * 在容器或隔离子进程内运行，不包含 LLM 或 Goal 状态机。
 * 通过 Mux tools 通道提供 read_file, web_search, web_fetch, submit_answer 的 RPC 远程调用服务。
 * 网络工具请求反向代理回宿主 backendHandler。
 *
 * @param options - 可选的输入输出流、工作区与任务配置。
 *
 * @example
 * ```ts
 * await runGaiaToolsWorker({ workspaceRoot: "/workspace", taskId: "gaia-1" });
 * ```
 */
export async function runGaiaToolsWorker(
    options?: GaiaToolsWorkerOptions,
): Promise<void> {
    const parsedArgs = parseArgs(process.argv.slice(2));
    const workspaceRoot = options?.workspaceRoot
        ?? parsedArgs.workspaceRoot
        ?? process.env.LAZYGOAL_WORKSPACE_ROOT
        ?? "/workspace";

    const taskId = options?.taskId
        ?? parsedArgs.taskId
        ?? process.env.LAZYGOAL_TASK_ID;

    if (!taskId || taskId.trim().length === 0) {
        throw new Error("Missing required taskId for GAIA tools worker");
    }

    const answerFilePath = options?.answerFilePath
        ?? parsedArgs.answerFilePath
        ?? process.env.LAZYGOAL_ANSWER_FILE;

    const input = options?.input
        ?? (Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>);
    const output = options?.output
        ?? (Writable.toWeb(process.stdout) as WritableStream<Uint8Array>);

    const mux = new MultiplexedConnection({ input, output });

    const server = new ToolRpcServer({
        stream: mux.channel("tools"),
        getTools: (backendPort) =>
            createGaiaToolRegistrations({
                workspaceRoot,
                taskId,
                ...(answerFilePath !== undefined ? { answerFilePath } : {}),
                backendPort,
                ...(options?.onSubmit !== undefined ? { onSubmit: options.onSubmit } : {}),
            }),
    });

    try {
        await mux.closed;
    } finally {
        server.close();
        await mux.close().catch(() => undefined);
    }
}

function parseArgs(args: readonly string[]): {
    readonly workspaceRoot?: string;
    readonly taskId?: string;
    readonly answerFilePath?: string;
} {
    let workspaceRoot: string | undefined;
    let taskId: string | undefined;
    let answerFilePath: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--workspace-root" && i + 1 < args.length) {
            workspaceRoot = args[i + 1];
            i++;
        } else if (args[i] === "--task-id" && i + 1 < args.length) {
            taskId = args[i + 1];
            i++;
        } else if (args[i] === "--answer-file" && i + 1 < args.length) {
            answerFilePath = args[i + 1];
            i++;
        }
    }

    return { workspaceRoot, taskId, answerFilePath };
}

if (
    process.argv[1] !== undefined
    && (process.argv[1].endsWith("tools-worker-entry.ts") || process.argv[1].endsWith("tools-worker.mjs"))
) {
    void runGaiaToolsWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
