import { Readable, Writable } from "node:stream";
import { MultiplexedConnection } from "../../src/multiplex.js";
import { ToolRpcServer } from "../../src/tool-rpc.js";
import { createSwebenchToolRegistrations } from "./tool-manifest.js";

/** SWE-bench 独立工具 Worker 的启动选项。 */
export interface SwebenchToolsWorkerOptions {
    /** 进程输入流，默认 process.stdin。 */
    readonly input?: ReadableStream<Uint8Array>;
    /** 进程输出流，默认 process.stdout。 */
    readonly output?: WritableStream<Uint8Array>;
    /** 沙箱工作区根目录，默认 `/testbed`。 */
    readonly workspaceRoot?: string;
}

/**
 * 启动 SWE-bench 沙箱工具 Worker 服务。
 *
 * @remarks
 * 在容器或隔离子进程内运行，不包含 LLM 或 Goal 状态机。
 * 通过 Mux tools 通道提供 read_file, write_file, edit_file, grep, bash 的 RPC 远程调用服务。
 *
 * @param options - 可选的输入输出流与工作区路径配置。
 *
 * @example
 * ```ts
 * await runSwebenchToolsWorker({ workspaceRoot: "/testbed" });
 * ```
 */
export async function runSwebenchToolsWorker(
    options?: SwebenchToolsWorkerOptions,
): Promise<void> {
    const parsedArgs = parseArgs(process.argv.slice(2));
    const workspaceRoot = options?.workspaceRoot
        ?? parsedArgs.workspaceRoot
        ?? process.env.LAZYGOAL_WORKSPACE_ROOT
        ?? "/testbed";

    const input = options?.input
        ?? (Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>);
    const output = options?.output
        ?? (Writable.toWeb(process.stdout) as WritableStream<Uint8Array>);

    const mux = new MultiplexedConnection({ input, output });

    const server = new ToolRpcServer({
        stream: mux.channel("tools"),
        getTools: () => createSwebenchToolRegistrations(workspaceRoot),
    });

    try {
        await mux.closed;
    } finally {
        server.close();
        await mux.close().catch(() => undefined);
    }
}

function parseArgs(args: readonly string[]): { readonly workspaceRoot?: string } {
    let workspaceRoot: string | undefined;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--workspace-root" && i + 1 < args.length) {
            workspaceRoot = args[i + 1];
            i++;
        }
    }
    return { workspaceRoot };
}

if (
    process.argv[1] !== undefined
    && (process.argv[1].endsWith("tools-worker-entry.ts") || process.argv[1].endsWith("tools-worker.mjs"))
) {
    void runSwebenchToolsWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
