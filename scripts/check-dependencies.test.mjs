import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    analyzeDependencies,
    checkDependencies,
} from "./check-dependencies.mjs";

const EXISTING_PACKAGES = ["runtime", "llm", "storage", "agent", "tools"];

async function fixtureProject(files) {
    const root = await mkdtemp(path.join(os.tmpdir(), "lazygoal-dependencies-"));
    for (const [relativePath, content] of Object.entries(files)) {
        const target = path.join(root, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
    }
    return root;
}

test("allows existing packages to depend on contracts", async () => {
    const files = {
        "packages/contracts/src/index.ts": "export const contract = true;\n",
    };
    for (const packageName of EXISTING_PACKAGES) {
        files[`packages/${packageName}/src/index.ts`] =
            'export { contract } from "../../contracts/src/index";\n';
    }
    // Agent 公共入口只转发默认装配；该约束由入口规则单独验证。
    files["packages/agent/src/index.ts"] =
        'export { createAgentExecutor } from "./create-agent-executor";\n';

    const root = await fixtureProject(files);

    assert.equal(await checkDependencies(root), EXISTING_PACKAGES.length + 1);
});

test("rejects outbound dependencies from contracts", async () => {
    const root = await fixtureProject({
        "packages/contracts/src/index.ts":
            'export {} from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/index）",
    ]);
});

test("rejects cross benchmark imports", async () => {
    const root = await fixtureProject({
        "benchmarks/alfworld/src/index.ts":
            'export { run } from "../../swebench/src/worker-runtime";\n',
        "benchmarks/swebench/src/worker-runtime.ts": "export const run = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止 benchmark 交叉依赖：benchmarks/alfworld 不得导入 benchmarks/swebench（benchmarks/alfworld/src/index.ts 引用 ../../swebench/src/worker-runtime）",
    ]);
});

test("rejects gaia cross benchmark imports with swebench and alfworld", async () => {
    const root = await fixtureProject({
        "benchmarks/gaia/src/index.ts":
            'export { run } from "../../swebench/src/worker-runtime";\nexport { alf } from "../../alfworld/src/index";\n',
        "benchmarks/swebench/src/worker-runtime.ts": "export const run = true;\n",
        "benchmarks/alfworld/src/index.ts": "export const alf = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止 benchmark 交叉依赖：benchmarks/gaia 不得导入 benchmarks/alfworld（benchmarks/gaia/src/index.ts 引用 ../../alfworld/src/index）",
        "禁止 benchmark 交叉依赖：benchmarks/gaia 不得导入 benchmarks/swebench（benchmarks/gaia/src/index.ts 引用 ../../swebench/src/worker-runtime）",
    ]);
});

test("rejects tua-bench cross benchmark imports with other benchmarks", async () => {
    const root = await fixtureProject({
        "benchmarks/tua-bench/src/index.ts":
            'export { run } from "../../swebench/src/worker-runtime";\nexport { alf } from "../../alfworld/src/index";\n',
        "benchmarks/swebench/src/worker-runtime.ts": "export const run = true;\n",
        "benchmarks/alfworld/src/index.ts": "export const alf = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止 benchmark 交叉依赖：benchmarks/tua-bench 不得导入 benchmarks/alfworld（benchmarks/tua-bench/src/index.ts 引用 ../../alfworld/src/index）",
        "禁止 benchmark 交叉依赖：benchmarks/tua-bench 不得导入 benchmarks/swebench（benchmarks/tua-bench/src/index.ts 引用 ../../swebench/src/worker-runtime）",
    ]);
});

test("allows apps/goal-board to import web-contracts and rejects backend packages", async () => {
    const root = await fixtureProject({
        "packages/web-contracts/src/index.ts": "export const contracts = true;\n",
        "packages/runtime/src/index.ts": "export const runtime = true;\n",
        "apps/goal-board/src/valid.ts": 'export { contracts } from "../../../packages/web-contracts/src/index";\n',
        "apps/goal-board/src/invalid.ts": 'export { runtime } from "../../../packages/runtime/src/index";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：apps/goal-board 不得导入 packages/runtime（apps/goal-board/src/invalid.ts 引用 ../../../packages/runtime/src/index）",
    ]);
});

test("rejects outbound dependencies from web-contracts", async () => {
    const root = await fixtureProject({
        "packages/web-contracts/src/index.ts": 'export {} from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/web-contracts 不得导入 packages/runtime（packages/web-contracts/src/index.ts 引用 ../../runtime/src/index）",
    ]);
});

test("rejects outbound dependencies from execution-control", async () => {
    const root = await fixtureProject({
        "packages/execution-control/src/index.ts": 'export {} from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/execution-control 不得导入 packages/runtime（packages/execution-control/src/index.ts 引用 ../../runtime/src/index）",
    ]);
});

test("rejects outbound dependencies from llm to runtime", async () => {
    const root = await fixtureProject({
        "packages/llm/src/index.ts": 'export {} from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/llm 不得导入 packages/runtime（packages/llm/src/index.ts 引用 ../../runtime/src/index）",
    ]);
});

test("rejects outbound dependencies from working-memory to runtime", async () => {
    const root = await fixtureProject({
        "packages/working-memory/src/index.ts": 'export {} from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/working-memory 不得导入 packages/runtime（packages/working-memory/src/index.ts 引用 ../../runtime/src/index）",
    ]);
});

test("rejects outbound dependencies from model-contracts to working-memory", async () => {
    const root = await fixtureProject({
        "packages/model-contracts/src/index.ts": 'export {} from "../../working-memory/src/index";\n',
        "packages/working-memory/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/model-contracts 不得导入 packages/working-memory（packages/model-contracts/src/index.ts 引用 ../../working-memory/src/index）",
    ]);
});

/** 只保留本次组件边界规则产生的违规，便于与既有包间规则分别断言。 */
function componentViolations(violations) {
    return violations.filter((violation) => violation.startsWith("组件") || violation.startsWith("构件"));
}

test("组件目录内部引用与入口调用通过，测试可定向导入内部实现", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/index.ts":
            'export { createRuntimeComposition } from "./composition";\nexport { createExecutionComponents } from "./execution-composition";\n',
        "apps/goal-server/src/runtime/composition.ts":
            'import { createExecutionComponents } from "./execution-composition";\nexport const createRuntimeComposition = createExecutionComponents;\n',
        "apps/goal-server/src/runtime/execution-composition.ts":
            'import { GoalCoordinator } from "../../../../packages/runtime/src/index";\nexport const createExecutionComponents = GoalCoordinator;\n',
        "apps/goal-server/src/composition-root.ts":
            'export { createRuntimeComposition } from "./runtime";\n',
        "apps/goal-server/test/runtime-composition.test.ts":
            'import { createRuntimeComposition } from "../src/runtime/index";\nimport { createExecutionComponents } from "../src/runtime/execution-composition";\nvoid createRuntimeComposition;\nvoid createExecutionComponents;\n',
        "packages/runtime/src/lifecycle/index.ts":
            'export { RuntimeLifecycle } from "./runtime-lifecycle";\n',
        "packages/runtime/src/lifecycle/runtime-lifecycle.ts":
            'import type { CheckpointGateGoalStore } from "../checkpoint-gate";\nexport const RuntimeLifecycle = true as unknown as CheckpointGateGoalStore;\n',
        "packages/runtime/src/index.ts":
            'export { RuntimeLifecycle } from "./lifecycle";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), []);
});

test("运行时组件不得反向依赖宿主 CLI、组合根、Browser/HTTP/Web wire 与 Node HTTP", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/composition.ts": [
            'import { runCli } from "../cli";',
            'import { createCompositionRoot } from "../composition-root";',
            'import { BrowserGoalCommandService } from "../../../../packages/browser/src/index";',
            'import { createHttpService } from "../../../../packages/http/src/index";',
            'import { BrowserGoalSession } from "../../../../packages/web-contracts/src/index";',
            'import { createServer } from "node:http";',
            "export const wiring = [runCli, createCompositionRoot, BrowserGoalCommandService, createHttpService, BrowserGoalSession, createServer];",
        ].join("\n"),
        "apps/goal-server/src/cli.ts": "export const runCli = true;\n",
        "apps/goal-server/src/composition-root.ts": "export const createCompositionRoot = true;\n",
        "packages/browser/src/index.ts": "export const BrowserGoalCommandService = true;\n",
        "packages/http/src/index.ts": "export const createHttpService = true;\n",
        "packages/web-contracts/src/index.ts": "export const BrowserGoalSession = true;\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)), [
        "组件边界违规：Goal Server 运行时组件 不得导入 Browser 传输实现（apps/goal-server/src/runtime/composition.ts 引用 ../../../../packages/browser/src/index）",
        "组件边界违规：Goal Server 运行时组件 不得导入 HTTP 宿主实现（apps/goal-server/src/runtime/composition.ts 引用 ../../../../packages/http/src/index）",
        "组件边界违规：Goal Server 运行时组件 不得导入 HTTP 组合根（apps/goal-server/src/runtime/composition.ts 引用 ../composition-root）",
        "组件边界违规：Goal Server 运行时组件 不得导入 Node HTTP 服务实现（apps/goal-server/src/runtime/composition.ts 引用 node:http）",
        "组件边界违规：Goal Server 运行时组件 不得导入 Web wire DTO（apps/goal-server/src/runtime/composition.ts 引用 ../../../../packages/web-contracts/src/index）",
        "组件边界违规：Goal Server 运行时组件 不得导入 宿主 CLI（apps/goal-server/src/runtime/composition.ts 引用 ../cli）",
    ]);
});

test("执行装配组件不得引用具体 Agent、配置、存储与默认工具实现", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/execution-composition.ts": [
            'import { LLMStepExecutor } from "../../../../packages/agent/src/index";',
            'import { readLLMConfig } from "../../../../packages/config/src/index";',
            'import { JsonFileGoalStore } from "../../../../packages/storage/src/index";',
            'import { ProcessManager } from "../../../../packages/tools/src/index";',
            "export const wiring = [LLMStepExecutor, readLLMConfig, JsonFileGoalStore, ProcessManager];",
        ].join("\n"),
        "packages/agent/src/index.ts": "export const LLMStepExecutor = true;\n",
        "packages/config/src/index.ts": "export const readLLMConfig = true;\n",
        "packages/storage/src/index.ts": "export const JsonFileGoalStore = true;\n",
        "packages/tools/src/index.ts": "export const ProcessManager = true;\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)), [
        "组件边界违规：执行装配组件 不得导入 具体 Agent/LLM 实现（apps/goal-server/src/runtime/execution-composition.ts 引用 ../../../../packages/agent/src/index）",
        "组件边界违规：执行装配组件 不得导入 具体文件存储（apps/goal-server/src/runtime/execution-composition.ts 引用 ../../../../packages/storage/src/index）",
        "组件边界违规：执行装配组件 不得导入 应用配置解析（apps/goal-server/src/runtime/execution-composition.ts 引用 ../../../../packages/config/src/index）",
        "组件边界违规：执行装配组件 不得导入 默认工具准备（apps/goal-server/src/runtime/execution-composition.ts 引用 ../../../../packages/tools/src/index）",
    ]);
});

test("实例生命周期不得依赖应用、模型或具体存储实现", async () => {
    const root = await fixtureProject({
        "packages/runtime/src/lifecycle/runtime-lifecycle.ts": [
            'import { createCompositionRoot } from "../../../../apps/goal-server/src/composition-root";',
            'import { LLMStepExecutor } from "../../../agent/src/index";',
            'import { JsonFileGoalStore } from "../../../storage/src/index";',
            "export const wiring = [createCompositionRoot, LLMStepExecutor, JsonFileGoalStore];",
        ].join("\n"),
        "apps/goal-server/src/composition-root.ts": "export const createCompositionRoot = true;\n",
        "packages/agent/src/index.ts": "export const LLMStepExecutor = true;\n",
        "packages/storage/src/index.ts": "export const JsonFileGoalStore = true;\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)).sort(), [
        "组件边界违规：Runtime 实例生命周期 不得导入 具体 Agent/LLM 实现（packages/runtime/src/lifecycle/runtime-lifecycle.ts 引用 ../../../agent/src/index）",
        "组件边界违规：Runtime 实例生命周期 不得导入 具体文件存储（packages/runtime/src/lifecycle/runtime-lifecycle.ts 引用 ../../../storage/src/index）",
        "组件边界违规：Runtime 实例生命周期 不得导入 应用与宿主实现（packages/runtime/src/lifecycle/runtime-lifecycle.ts 引用 ../../../../apps/goal-server/src/composition-root）",
    ]);
});

test("组件不得直接请求进程退出或注册进程信号", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/composition.ts":
            'export function stop() { process.exit(1); }\nprocess.on("SIGINT", () => {});\n',
        "packages/runtime/src/lifecycle/runtime-lifecycle.ts":
            "export function stop() { process.exit(0); }\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)), [
        "组件边界违规：Goal Server 运行时组件 不得直接请求进程退出或注册进程信号（apps/goal-server/src/runtime/composition.ts 包含 process 信号监听）",
        "组件边界违规：Goal Server 运行时组件 不得直接请求进程退出或注册进程信号（apps/goal-server/src/runtime/composition.ts 包含 process.exit(）",
        "组件边界违规：Runtime 实例生命周期 不得直接请求进程退出或注册进程信号（packages/runtime/src/lifecycle/runtime-lifecycle.ts 包含 process.exit(）",
    ]);
});

test("组件入口规则覆盖重新导出、侧效导入与字面量动态导入，并允许目录内部引用", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/index.ts": "export {};\n",
        "apps/goal-server/src/runtime/composition.ts": "export const createRuntimeComposition = true;\n",
        "apps/goal-server/src/runtime/execution-composition.ts": "export const createExecutionComponents = true;\n",
        "apps/goal-server/src/composition-root.ts": [
            'export { createRuntimeComposition } from "./runtime/composition";',
            'import { createExecutionComponents } from "./runtime/execution-composition";',
            "void createExecutionComponents;",
        ].join("\n"),
        "apps/goal-server/src/runtime-bridge.ts":
            'export async function load() { return import("./runtime/composition"); }\n',
        "packages/runtime/src/lifecycle/index.ts": "export {};\n",
        "packages/runtime/src/lifecycle/runtime-lifecycle.ts": "export const RuntimeLifecycle = true;\n",
        "packages/runtime/src/index.ts":
            'export { RuntimeLifecycle } from "./lifecycle/runtime-lifecycle";\n',
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)).sort(), [
        "组件入口违规：apps/goal-server/src/composition-root.ts 必须通过 apps/goal-server/src/runtime/index.ts 访问Goal Server 运行时组件（引用 ./runtime/composition）",
        "组件入口违规：apps/goal-server/src/composition-root.ts 必须通过 apps/goal-server/src/runtime/index.ts 访问Goal Server 运行时组件（引用 ./runtime/execution-composition）",
        "组件入口违规：apps/goal-server/src/runtime-bridge.ts 必须通过 apps/goal-server/src/runtime/index.ts 访问Goal Server 运行时组件（引用 ./runtime/composition）",
        "组件入口违规：packages/runtime/src/index.ts 必须通过 packages/runtime/src/lifecycle/index.ts 访问Runtime 实例生命周期（引用 ./lifecycle/runtime-lifecycle）",
    ]);
});

test("组件边界与入口规则在路径归一化后判断", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/composition.ts":
            'import { runCli } from ".././cli";\nimport { createCompositionRoot } from "./../composition-root";\nexport const wiring = [runCli, createCompositionRoot];\n',
        "apps/goal-server/src/cli.ts": "export const runCli = true;\n",
        "apps/goal-server/src/composition-root.ts": "export const createCompositionRoot = true;\n",
        "apps/goal-server/src/consumer.ts":
            'import { createRuntimeComposition } from "./runtime/../runtime/composition";\nvoid createRuntimeComposition;\n',
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)).sort(), [
        "组件入口违规：apps/goal-server/src/consumer.ts 必须通过 apps/goal-server/src/runtime/index.ts 访问Goal Server 运行时组件（引用 ./runtime/../runtime/composition）",
        "组件边界违规：Goal Server 运行时组件 不得导入 HTTP 组合根（apps/goal-server/src/runtime/composition.ts 引用 ./../composition-root）",
        "组件边界违规：Goal Server 运行时组件 不得导入 宿主 CLI（apps/goal-server/src/runtime/composition.ts 引用 .././cli）",
    ]);
});

test("组件与其消费型测试拒绝项目内构建产物，第三方依赖产物不受限", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/runtime/execution-composition.ts": [
            'import { helper } from "../../../../dist/runtime/index";',
            'import { z } from "../../../../node_modules/zod/dist/index";',
            "export const wiring = [helper, z];",
        ].join("\n"),
        "apps/goal-server/test/runtime-composition.integration.test.ts":
            'import { createRuntimeComposition } from "../dist/composition-root";\nvoid createRuntimeComposition;\n',
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)), [
        "构件导入违规：apps/goal-server/src/runtime/execution-composition.ts 不得导入项目内构建产物（引用 ../../../../dist/runtime/index）",
        "构件导入违规：apps/goal-server/test/runtime-composition.integration.test.ts 不得导入项目内构建产物（引用 ../dist/composition-root）",
    ]);
});

test("进程会话运行时允许 Runtime/Sandbox 依赖与自有进程 API，消费者经入口调用", async () => {
    const root = await fixtureProject({
        "packages/process-runtime/src/index.ts":
            'export { ProcessManager } from "./process-manager";\n',
        "packages/process-runtime/src/process-manager.ts": [
            'import type { ManagedResource, ManagedResourceRegistry, ProcessSessionStore } from "../../runtime/src/index";',
            'import { killProcessGroup, sendSignalToProcessGroup, spawnRestrictedCommand } from "../../sandbox/src/index";',
            'import type { ChildProcess } from "node:child_process";',
            'import { EventEmitter } from "node:events";',
            "export const wiring = [spawnRestrictedCommand, killProcessGroup, sendSignalToProcessGroup, EventEmitter];",
        ].join("\n"),
        "packages/process-runtime/src/./errors.ts": "export class ProcessSessionError extends Error {}\n",
        "packages/process-runtime/test/process-manager.test.ts":
            'import { ProcessManager } from "../src/process-manager";\nimport { ProcessSessionError } from "../src/errors";\nvoid ProcessManager;\nvoid ProcessSessionError;\n',
        "packages/tools/src/process-tools.ts":
            'import type { ProcessManager } from "../../process-runtime/src/index";\nvoid (null as unknown as ProcessManager);\n',
        "packages/runtime/src/index.ts": "export const ProcessSessionStore = true;\n",
        "packages/sandbox/src/index.ts":
            "export const spawnRestrictedCommand = true;\nexport const killProcessGroup = true;\nexport const sendSignalToProcessGroup = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), []);
});

test("进程会话运行时不得依赖工具、Agent、存储、应用与配置实现（含侧效与动态导入）", async () => {
    const root = await fixtureProject({
        "packages/process-runtime/src/leak.ts": [
            'import { ProcessStartTool } from "../../tools/src/index";',
            'import type { LLMStepExecutor } from "../../agent/src/index";',
            'import "../../storage/src/index";',
            'export async function loadApp() { return import("../../../apps/goal-server/src/runtime/index"); }',
            'export const required = require("../../config/src/index");',
            "export const wiring = [ProcessStartTool, required];",
        ].join("\n"),
        "packages/tools/src/index.ts": "export const ProcessStartTool = true;\n",
        "packages/agent/src/index.ts": "export const LLMStepExecutor = true;\n",
        "packages/storage/src/index.ts": "export const JsonFileGoalStore = true;\n",
        "packages/config/src/index.ts": "export const loadRuntimeConfig = true;\n",
        "packages/runtime/src/index.ts": "export {};\n",
        "packages/sandbox/src/index.ts": "export {};\n",
        "apps/goal-server/src/runtime/index.ts": "export {};\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)).sort(), [
        "组件边界违规：进程会话运行时 不得导入 具体 Agent/LLM 实现（packages/process-runtime/src/leak.ts 引用 ../../agent/src/index）",
        "组件边界违规：进程会话运行时 不得导入 具体文件存储（packages/process-runtime/src/leak.ts 引用 ../../storage/src/index）",
        "组件边界违规：进程会话运行时 不得导入 工具协议与授权（packages/process-runtime/src/leak.ts 引用 ../../tools/src/index）",
        "组件边界违规：进程会话运行时 不得导入 应用与宿主实现（packages/process-runtime/src/leak.ts 引用 ../../../apps/goal-server/src/runtime/index）",
        "组件边界违规：进程会话运行时 不得导入 环境配置解析（packages/process-runtime/src/leak.ts 引用 ../../config/src/index）",
    ]);
});

test("进程会话运行时不得请求宿主退出或注册进程信号，发送自有进程组信号不误禁", async () => {
    const root = await fixtureProject({
        "packages/process-runtime/src/exit.ts":
            'export function stop() { process.exit(1); }\nprocess.once("SIGTERM", () => {});\n',
        "packages/process-runtime/src/group-signal.ts":
            'import { sendSignalToProcessGroup } from "../../sandbox/src/index";\nexport function stop(child) { sendSignalToProcessGroup(child, "SIGKILL"); }\n',
        "packages/runtime/src/index.ts": "export {};\n",
        "packages/sandbox/src/index.ts": "export const sendSignalToProcessGroup = true;\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)), [
        "组件边界违规：进程会话运行时 不得直接请求进程退出或注册进程信号（packages/process-runtime/src/exit.ts 包含 process 信号监听）",
        "组件边界违规：进程会话运行时 不得直接请求进程退出或注册进程信号（packages/process-runtime/src/exit.ts 包含 process.exit(）",
    ]);
});

test("Runtime 反向依赖进程会话运行时在所有引用形式上定位失败", async () => {
    const root = await fixtureProject({
        "packages/runtime/src/leak.ts": [
            'import { ProcessManager } from "../../process-runtime/src/index";',
            'export {} from "../../process-runtime/src/errors";',
            'import type { ProcessSessionFailure } from "../../process-runtime/src/process-manager";',
            'import "../../process-runtime/src/./errors";',
            'export async function load() { return import("../../process-runtime/src/../src/errors"); }',
            'export const required = require("../../process-runtime/src/./process-manager");',
            "void ProcessManager;\nvoid required;",
        ].join("\n"),
        "packages/process-runtime/src/index.ts": "export const ProcessManager = true;\n",
        "packages/process-runtime/src/errors.ts": "export const ProcessSessionFailure = true;\n",
        "packages/process-runtime/src/process-manager.ts": "export const ProcessManager = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/leak.ts 引用 ../../process-runtime/src/../src/errors）",
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/leak.ts 引用 ../../process-runtime/src/./errors）",
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/leak.ts 引用 ../../process-runtime/src/./process-manager）",
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/leak.ts 引用 ../../process-runtime/src/errors）",
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/leak.ts 引用 ../../process-runtime/src/index）",
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/leak.ts 引用 ../../process-runtime/src/process-manager）",
        "组件入口违规：packages/runtime/src/leak.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/../src/errors）",
        "组件入口违规：packages/runtime/src/leak.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/./errors）",
        "组件入口违规：packages/runtime/src/leak.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/./process-manager）",
        "组件入口违规：packages/runtime/src/leak.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/errors）",
        "组件入口违规：packages/runtime/src/leak.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/process-manager）",
    ]);
});

test("进程会话运行时的消费者必须通过入口，测试与内部引用不误报", async () => {
    const root = await fixtureProject({
        "packages/process-runtime/src/index.ts":
            'export { ProcessManager } from "./process-manager";\n',
        "packages/process-runtime/src/process-manager.ts": "export const ProcessManager = true;\n",
        "packages/process-runtime/src/internal-state.ts":
            'import { ProcessManager } from "./process-manager";\nexport const state = ProcessManager;\n',
        "packages/process-runtime/test/process-manager.test.ts":
            'import { ProcessManager } from "../src/process-manager";\nvoid ProcessManager;\n',
        "packages/tools/src/process-tools.ts":
            'import type { ProcessManager } from "../../process-runtime/src/process-manager";\nvoid (null as unknown as ProcessManager);\n',
        "apps/goal-server/src/runtime/composition.ts":
            'import { ProcessManager } from "../../../../packages/process-runtime/src/errors";\nexport const wiring = ProcessManager;\n',
        "packages/runtime/src/index.ts": "export {};\n",
        "packages/sandbox/src/index.ts": "export {};\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)).sort(), [
        "组件入口违规：apps/goal-server/src/runtime/composition.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../../../packages/process-runtime/src/errors）",
        "组件入口违规：packages/tools/src/process-tools.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/process-manager）",
    ]);
});

test("进程会话运行时源码与其消费型测试拒绝项目内构建产物", async () => {
    const root = await fixtureProject({
        "packages/process-runtime/src/leak.ts":
            'import { helper } from "../../process-runtime/dist/index";\nexport const wiring = helper;\n',
        "packages/process-runtime/test/process-manager.test.ts":
            'import { ProcessManager } from "../dist/index";\nvoid ProcessManager;\n',
        "packages/process-runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(componentViolations(await analyzeDependencies(root)).sort(), [
        "构件导入违规：packages/process-runtime/src/leak.ts 不得导入项目内构建产物（引用 ../../process-runtime/dist/index）",
        "构件导入违规：packages/process-runtime/test/process-manager.test.ts 不得导入项目内构建产物（引用 ../dist/index）",
    ]);
});

test("detects side-effect imports and literal dynamic imports of forbidden directions", async () => {
    const root = await fixtureProject({
        "packages/context-budget/src/index.ts":
            'import "../../model-view/src/index";\nconst loaded = import("../../model-view/src/index");\nvoid loaded;\n',
        "packages/model-view/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/context-budget 不得导入 packages/model-view（packages/context-budget/src/index.ts 引用 ../../model-view/src/index）",
    ]);
});

test("detects type-position import expressions leaking runtime into view DTOs", async () => {
    const root = await fixtureProject({
        "packages/model-view/src/model-inference-view.ts":
            'export type Leak = import("../../runtime/src/index").Goal;\n',
        "packages/model-view/src/other.ts": 'export type Local = import("./model-inference-view").Leak;\n',
        "packages/runtime/src/index.ts": "export type Goal = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/model-view 不得导入 packages/runtime（packages/model-view/src/model-inference-view.ts 引用 ../../runtime/src/index）",
        "边界违规：ModelInferenceView DTO 不得导入 packages/runtime（packages/model-view/src/model-inference-view.ts 引用 ../../runtime/src/index）",
    ]);
});

test("requires component packages to be consumed through public entries", async () => {
    const root = await fixtureProject({
        "packages/model-view/src/index.ts": "export const view = true;\n",
        "packages/model-view/src/internal.ts": "export const hidden = true;\n",
        "packages/model-view/src/other.ts": 'export { hidden } from "./internal";\n',
        "packages/prompt-renderer/src/index.ts":
            'export { view } from "../../model-view/src/index";\n',
        "packages/prompt-renderer/src/penetrating.ts":
            'export { hidden } from "../../model-view/src/internal";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "入口穿透：packages/prompt-renderer 必须经 packages/<目标>/src/index.ts 使用组件能力（packages/prompt-renderer/src/penetrating.ts 引用 ../../model-view/src/internal）",
    ]);
});

test("detects cross-package internal penetration from apps and benchmarks", async () => {
    const root = await fixtureProject({
        "packages/model-call/src/index.ts": "export const call = true;\n",
        "packages/model-call/src/internal.ts": "export const hidden = true;\n",
        "apps/goal-server/src/composition-root.ts":
            'export { hidden } from "../../../packages/model-call/src/internal";\n',
        "benchmarks/alfworld/src/worker.ts":
            'export { hidden } from "../../../packages/model-call/src/internal";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "入口穿透：apps/goal-server 必须经 packages/<目标>/src/index.ts 使用组件能力（apps/goal-server/src/composition-root.ts 引用 ../../../packages/model-call/src/internal）",
        "入口穿透：benchmarks/alfworld 必须经 packages/<目标>/src/index.ts 使用组件能力（benchmarks/alfworld/src/worker.ts 引用 ../../../packages/model-call/src/internal）",
    ]);
});

test("rejects project artifact imports from package, app and benchmark sources", async () => {
    const root = await fixtureProject({
        "packages/runtime/src/index.ts":
            'export { a } from "../../agent/dist/index.js";\n',
        "apps/goal-server/src/composition-root.ts":
            'export { v } from "../../../packages/model-view/dist/index.js";\n',
        "benchmarks/alfworld/src/worker.ts":
            'export { p } from "../../../packages/prompt-bundle/build/index.js";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止导入项目产物：apps/goal-server/src/composition-root.ts 引用 ../../../packages/model-view/dist/index.js（packages/model-view/dist/index.js）",
        "禁止导入项目产物：benchmarks/alfworld/src/worker.ts 引用 ../../../packages/prompt-bundle/build/index.js（packages/prompt-bundle/build/index.js）",
        "禁止导入项目产物：packages/runtime/src/index.ts 引用 ../../agent/dist/index.js（packages/agent/dist/index.js）",
    ]);
});

test("rejects roundtrip dependencies between component packages", async () => {
    const root = await fixtureProject({
        "packages/model-view/src/index.ts":
            'export {} from "../../model-context/src/index";\n',
        "packages/model-context/src/index.ts":
            'export {} from "../../model-view/src/index";\n',
        "packages/prompt-bundle/src/index.ts":
            'export {} from "../../model-request/src/index";\n',
        "packages/model-request/src/index.ts":
            'export {} from "../../prompt-renderer/src/index";\n',
        "packages/model-response/src/index.ts":
            'export {} from "../../runtime/src/index";\n',
        "packages/model-call/src/index.ts":
            'export {} from "../../model-request/src/index";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/model-call 不得导入 packages/model-request（packages/model-call/src/index.ts 引用 ../../model-request/src/index）",
        "禁止依赖方向：packages/model-response 不得导入 packages/runtime（packages/model-response/src/index.ts 引用 ../../runtime/src/index）",
        "禁止依赖方向：packages/model-view 不得导入 packages/model-context（packages/model-view/src/index.ts 引用 ../../model-context/src/index）",
        "禁止依赖方向：packages/prompt-bundle 不得导入 packages/model-request（packages/prompt-bundle/src/index.ts 引用 ../../model-request/src/index）",
    ]);
});

test("constrains the agent public entry to the default assembly", async () => {
    const root = await fixtureProject({
        "packages/agent/src/create-agent-executor.ts": "export const createAgentExecutor = true;\n",
        "packages/agent/src/old-executor.ts": "export const old = true;\n",
        "packages/agent/src/index.ts":
            'export { createAgentExecutor } from "./create-agent-executor";\nexport type { AgentExecutorOptions } from "./create-agent-executor";\nexport { old } from "./old-executor";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "入口约束：packages/agent 公共入口只能转发默认装配（packages/agent/src/index.ts 引用 ./old-executor）",
    ]);
});
