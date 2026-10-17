import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import type { LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { ManagedResourceRegistry, type AgentProfile } from "../../../packages/runtime/src/index";
import {
    JsonFileProcessSessionStore,
    AgentProfileConfigurationError,
} from "../../../packages/storage/src/index";
import type { ToolObservation, ToolRegistry } from "../../../packages/tool-core/src/index";
import {
    PROCESS_READ_TOOL_ID,
    PROCESS_START_TOOL_ID,
    PROCESS_STOP_TOOL_ID,
    type ProcessReadOutput,
    type ProcessStartOutput,
} from "../../../packages/tools/src/index";
import {
    createRuntimeComposition,
} from "../src/runtime/index";
import {
    createCompositionRoot,
    type CompositionRoot,
} from "../src/composition-root";
import { SHUTDOWN_EXIT_CODE, type ExitPort } from "../src/process-exit";

/** 只用于装配的确定性适配器；进程工具场景不应调用模型。 */
class UnusedAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    readonly modelId = "model-process-composition";

    async generate(_request: LLMRequest): Promise<LLMResponse> {
        throw new Error("model must not be called");
    }
}

class RecordingExitPort implements ExitPort {
    readonly codes: number[] = [];

    exit(code: number): void {
        this.codes.push(code);
    }
}

const profile: AgentProfile = {
    id: "profile-process-composition",
    systemPrompt: "Process-only composition profile.",
    instructions: ["Use process tools only."],
    toolIds: [PROCESS_START_TOOL_ID, PROCESS_READ_TOOL_ID, PROCESS_STOP_TOOL_ID],
};

async function setupFixture(): Promise<{
    readonly root: string;
    readonly workspace: string;
    readonly home: string;
    readonly dataDirectory: string;
    readonly cleanup: () => Promise<void>;
}> {
    const root = await mkdtemp(join(tmpdir(), "lg-proc-composition-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(home, { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    return {
        root,
        workspace,
        home,
        dataDirectory,
        cleanup: async () => {
            await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        },
    };
}

/** 轮询等待谓词返回非 undefined 值；超时抛出错误。 */
async function waitFor<T>(
    probe: () => T | undefined | Promise<T | undefined>,
    description: string,
    timeoutMs = 5_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await probe();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error(`等待条件超时：${description}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

async function pathExists(path: string): Promise<boolean> {
    return (await stat(path).catch(() => undefined)) !== undefined;
}

async function waitForPath(path: string): Promise<void> {
    await waitFor(() => pathExists(path).then((exists) => exists ? true : undefined), `路径 ${path}`);
}

/** 启动写出标记并保持存活的受管命令。 */
function managedProbe(markerPath: string): string {
    return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "1"); setTimeout(() => {}, 15000);'`;
}

/** 从默认注册表中取进程工具注册项；缺失时直接失败。 */
function processToolOf(registry: ToolRegistry, toolId: string) {
    const registration = registry.get(toolId);
    if (registration === undefined) {
        throw new Error(`default ${toolId} tool is not registered`);
    }
    return registration;
}

/** 经默认工具注册表准备并执行一次进程工具调用。 */
async function executeProcessTool(
    registry: ToolRegistry,
    toolId: string,
    actionId: string,
    context: { readonly goalId: string; readonly runId: string },
    input: { readonly command?: string; readonly processId?: string; readonly waitMs?: number },
): Promise<ToolObservation> {
    const prepared = processToolOf(registry, toolId).prepare({ ...input });
    if (!prepared.ok) {
        throw new Error(`input rejected for ${toolId}`);
    }
    return prepared.execute(actionId, context);
}

test("无界面装配：默认进程工具与实例生命周期共用同一管理器并清理自有进程", async () => {
    const fixture = await setupFixture();
    const adapter = new UnusedAdapter();
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter,
        profile,
    });
    const marker = join(fixture.workspace, "composition.marker");
    try {
        const observer = new JsonFileProcessSessionStore(fixture.dataDirectory, "observer-host");
        const started = await executeProcessTool(
            runtime.toolRegistry,
            PROCESS_START_TOOL_ID,
            "act-start",
            { goalId: "goal-composition", runId: "run-1" },
            { command: managedProbe(marker) },
        ) as { kind: string; output?: ProcessStartOutput };
        assert.equal(started.kind, "success");
        const processId = started.output!.processId;
        await waitForPath(marker);

        // 同一管理器持有的会话：读取返回 running
        const read = await executeProcessTool(
            runtime.toolRegistry,
            PROCESS_READ_TOOL_ID,
            "act-read",
            { goalId: "goal-composition", runId: "run-1" },
            { processId, waitMs: 500 },
        ) as { kind: string; output?: ProcessReadOutput };
        assert.equal(read.kind, "success");
        assert.equal(read.output!.status, "running");

        // 实例生命周期关闭：同一路径终止自有进程并结算记录
        await runtime.lifecycle.close();
        assert.equal(runtime.lifecycle.state, "closed");
        const finalRecord = await observer.getSession("goal-composition", processId);
        assert.equal(finalRecord?.status, "stopped");
        assert.equal(typeof finalRecord?.exitedAt, "string");

        // 默认工具仍指向已关闭的同一管理器：不再受理新启动
        const late = await executeProcessTool(
            runtime.toolRegistry,
            PROCESS_START_TOOL_ID,
            "act-late",
            { goalId: "goal-composition", runId: "run-1" },
            { command: managedProbe(join(fixture.workspace, "late.marker")) },
        ) as { kind: string; code?: string; message?: string };
        assert.equal(late.kind, "failure");
        assert.equal(late.code, "PROCESS_START_FAILED");
        assert.match(String(late.message), /closing/);
        assert.equal(await pathExists(join(fixture.workspace, "late.marker")), false);

        // 宿主进程继续工作并输出成功标记
        const stdout = execFileSync(process.execPath, ["-e", "console.log('host-alive')"], { encoding: "utf8" });
        assert.match(stdout, /host-alive/);
    } finally {
        await fixture.cleanup();
    }
});

test("装配失败结算实例资源且不创建进程资源", async () => {
    const fixture = await setupFixture();
    try {
        const resources = new ManagedResourceRegistry();
        await assert.rejects(
            createRuntimeComposition({
                cwd: fixture.workspace,
                env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
                dataDirectory: fixture.dataDirectory,
                adapter: new UnusedAdapter(),
                resources,
                profile: {
                    id: "profile-missing-tool",
                    systemPrompt: "unused",
                    instructions: [],
                    toolIds: ["missing_tool"],
                },
            }),
            AgentProfileConfigurationError,
        );

        // 装配中途注册的进程管理器经同一资源路径结算；没有创建进程目录
        assert.equal(resources.size, 0);
        assert.equal(resources.isClosing, true);
        assert.equal(existsSync(join(fixture.dataDirectory, "processes")), false);
    } finally {
        await fixture.cleanup();
    }
});

test("进程持久化故障不创建进程，修复后同一管理器继续可用", async () => {
    const fixture = await setupFixture();
    const blockedMarker = join(fixture.workspace, "blocked.marker");
    const okMarker = join(fixture.workspace, "ok.marker");
    try {
        // 用文件占住 processes 路径，使会话存储无法建立目录
        writeFileSync(join(fixture.dataDirectory, "processes"), "blocked");

        const runtime = await createRuntimeComposition({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter: new UnusedAdapter(),
            profile,
        });
        try {
            const blocked = await executeProcessTool(
                runtime.toolRegistry,
                PROCESS_START_TOOL_ID,
                "act-blocked",
                { goalId: "goal-blocked", runId: "run-1" },
                { command: managedProbe(blockedMarker) },
            ) as { kind: string; code?: string; message?: string };
            assert.equal(blocked.kind, "failure");
            assert.equal(blocked.code, "PROCESS_START_FAILED");
            assert.equal(await pathExists(blockedMarker), false);

            // 故障不破坏同一管理器的后续启动与实例关闭
            await rm(join(fixture.dataDirectory, "processes"), { force: true });
            const started = await executeProcessTool(
                runtime.toolRegistry,
                PROCESS_START_TOOL_ID,
                "act-ok",
                { goalId: "goal-blocked", runId: "run-1" },
                { command: managedProbe(okMarker) },
            ) as { kind: string; output?: ProcessStartOutput };
            assert.equal(started.kind, "success");
            await waitForPath(okMarker);

            await runtime.lifecycle.close();
            assert.equal(runtime.lifecycle.state, "closed");
            const observer = new JsonFileProcessSessionStore(fixture.dataDirectory, "observer-host");
            const record = await observer.getSession("goal-blocked", started.output!.processId);
            assert.equal(record?.status, "stopped");
        } finally {
            await runtime.lifecycle.close().catch(() => undefined);
        }
    } finally {
        await fixture.cleanup();
    }
});

test("受控宿主关闭：同一实例路径终止进程并请求退出码，宿主继续输出成功标记", async () => {
    const fixture = await setupFixture();
    const adapter = new UnusedAdapter();
    const exitPort = new RecordingExitPort();
    let root: CompositionRoot | undefined;
    const marker = join(fixture.workspace, "host-shutdown.marker");
    try {
        root = await createCompositionRoot({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter,
            profile,
            exitPort,
        });
        await root.httpService.start(0);

        const started = await executeProcessTool(
            root.toolRegistry,
            PROCESS_START_TOOL_ID,
            "act-host-start",
            { goalId: "goal-host-shutdown", runId: "run-1" },
            { command: managedProbe(marker) },
        ) as { kind: string; output?: ProcessStartOutput };
        assert.equal(started.kind, "success");
        await waitForPath(marker);

        await root.shutdownCoordinator.shutdown();

        assert.equal(root.lifecycle.state, "closed");
        assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);
        const observer = new JsonFileProcessSessionStore(fixture.dataDirectory, "observer-host");
        const record = await observer.getSession("goal-host-shutdown", started.output!.processId);
        assert.equal(record?.status, "stopped");

        // 关闭后宿主进程继续工作并输出成功标记
        const stdout = execFileSync(process.execPath, ["-e", "console.log('host-alive-after-shutdown')"], { encoding: "utf8" });
        assert.match(stdout, /host-alive-after-shutdown/);
    } finally {
        await root?.httpService.close().catch(() => undefined);
        await root?.lifecycle.close().catch(() => undefined);
        await fixture.cleanup();
    }
});
