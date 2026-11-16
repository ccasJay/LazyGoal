import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    analyzeDependencies,
    analyzeDependenciesWithScanner,
    checkDependencies,
    createSourceScanner,
    extractModuleSpecifiers,
} from "./check-dependencies.mjs";

const EXISTING_PACKAGES = ["runtime", "llm-core", "llm-google", "storage", "agent", "tools"];

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

test("rejects outbound dependencies from llm-core to config", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": 'export {} from "../../config/src/index";\n',
        "packages/config/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/llm-core 不得导入 packages/config（packages/llm-core/src/index.ts 引用 ../../config/src/index）",
    ]);
});

test("allows config to consume llm-core and rejects core SDK-style reverse edges", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": 'export const contracts = true;\n',
        "packages/config/src/index.ts": 'export { contracts } from "../../llm-core/src/index";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), []);
    assert.equal(await checkDependencies(root), 2);
});

test("allows llm-adapters to consume llm-core and rejects application config edges", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": "export const core = true;\n",
        "packages/llm-adapters/src/index.ts": 'export { core } from "../../llm-core/src/index";\nexport {} from "../../config/src/index";\n',
        "packages/config/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/llm-adapters 不得导入 packages/config（packages/llm-adapters/src/index.ts 引用 ../../config/src/index）",
    ]);
});

test("rejects outbound dependencies from llm-google to config", async () => {
    const root = await fixtureProject({
        "packages/llm-google/src/index.ts": 'export {} from "../../config/src/index";\n',
        "packages/config/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/llm-google 不得导入 packages/config（packages/llm-google/src/index.ts 引用 ../../config/src/index）",
    ]);
});

test("rejects outbound dependencies from llm-pi-ai to config and model-catalog", async () => {
    const root = await fixtureProject({
        "packages/llm-pi-ai/src/index.ts": 'export {} from "../../config/src/index";\nexport {} from "../../model-catalog/src/index";\n',
        "packages/config/src/index.ts": "export {};\n",
        "packages/model-catalog/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/llm-pi-ai 不得导入 packages/config（packages/llm-pi-ai/src/index.ts 引用 ../../config/src/index）",
        "禁止依赖方向：packages/llm-pi-ai 不得导入 packages/model-catalog（packages/llm-pi-ai/src/index.ts 引用 ../../model-catalog/src/index）",
    ]);
});

test("rejects outbound dependencies from model-catalog to generation adapters", async () => {
    const root = await fixtureProject({
        "packages/model-catalog/src/index.ts": 'export {} from "../../llm-pi-ai/src/index";\n',
        "packages/llm-pi-ai/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/model-catalog 不得导入 packages/llm-pi-ai（packages/model-catalog/src/index.ts 引用 ../../llm-pi-ai/src/index）",
    ]);
});

test("rejects vendor SDK leakage from llm-core and config across reference forms", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": 'import type OpenAI from "openai";\nexport type Client = import("@google/genai").GoogleGenAI;\n',
        "packages/config/src/index.ts": 'import "@earendil-works/pi-ai";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "供应商 SDK 泄漏：packages/config 不得引用 @earendil-works/pi-ai（packages/config/src/index.ts）",
        "供应商 SDK 泄漏：packages/llm-core 不得引用 @google/genai（packages/llm-core/src/index.ts）",
        "供应商 SDK 泄漏：packages/llm-core 不得引用 openai（packages/llm-core/src/index.ts）",
    ]);
});

test("allows capability entries and rejects cross-capability internal penetration", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": "export const core = true;\n",
        "packages/llm-adapters/src/index.ts": 'export { core } from "../../llm-core/src/index";\n',
        "packages/llm/src/index.ts": 'export { core } from "../../llm-core/src/types";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "跨能力包入口穿透：packages/llm/src/index.ts 不得越过 packages/llm-core/src/index.ts 消费（引用 ../../llm-core/src/types）",
    ]);
});

test("rejects removed llm path references and leftover forwarding files", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": "export const core = true;\n",
        "packages/llm/src/index.ts": 'export { createLlmAdapter } from "./factory";\n',
        "packages/llm/src/factory.ts": 'export { core } from "../../llm-core/src/index";\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "旧路径转发残留：packages/llm/src/factory.ts 仍然存在",
        "禁止引用旧 LLM 路径：packages/llm/src/index.ts 引用 ./factory",
    ]);
});

test("rejects project artifact references including literal dynamic imports", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": "export const core = true;\n",
        "packages/llm-adapters/src/index.ts": 'export const load = () => import("../../llm-core/dist/index.js");\n',
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止导入项目产物：packages/llm-adapters/src/index.ts 引用 ../../llm-core/dist/index.js（packages/llm-core/dist/index.js）",
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

const TS_REFERENCE_FORMS = [
    'import { alpha } from "./alpha";',
    'import "./side-effect";',
    'import type { Beta } from "./beta";',
    'export type { Gamma } from "./gamma";',
    'export * from "./delta";',
    'export type Epsilon = import("./epsilon").Epsilon;',
    'const zeta = import("./zeta");',
    'const eta = require("./eta");',
    'import theta = require("./theta");',
    'import iota from "./iota" with { type: "json" };',
    'import { alphaAgain } from "./alpha";',
];

const TS_REFERENCE_SPECIFIERS = [
    "./alpha",
    "./side-effect",
    "./beta",
    "./gamma",
    "./delta",
    "./epsilon",
    "./zeta",
    "./eta",
    "./theta",
    "./iota",
];

const PSEUDO_REFERENCES = [
    '// import { commented } from "./comment";',
    'const quoted = \'import { quoted } from "./string"\';',
    'const templated = `require("./template")`;',
    'const pattern = /import\\("\\.\\/regex"\\)/;',
    "const meta = import.meta.url;",
];

test("AST extraction covers every supported reference form in first-occurrence order", () => {
    const source = [
        ...TS_REFERENCE_FORMS,
        ...PSEUDO_REFERENCES,
        "const asserted = <string>meta;",
        "void [zeta, eta, quoted, templated, pattern, asserted];",
    ].join("\n");

    assert.deepEqual(
        extractModuleSpecifiers(source, "packages/example/src/index.ts"),
        TS_REFERENCE_SPECIFIERS,
    );
});

test("AST extraction enables JSX for tsx sources and still covers every reference form", () => {
    const source = [
        ...TS_REFERENCE_FORMS,
        'const element = <div className="x">{alpha}</div>;',
        "void element;",
    ].join("\n");

    assert.deepEqual(
        extractModuleSpecifiers(source, "apps/example/src/index.tsx"),
        TS_REFERENCE_SPECIFIERS,
    );
});

test("AST extraction ignores pseudo imports in comments strings templates and regexes", async () => {
    const root = await fixtureProject({
        "packages/contracts/src/index.ts": [
            '// import { fake } from "../../runtime/src/index";',
            'const quoted = \'import { fake } from "../../runtime/src/index"\';',
            'const templated = `require("../../runtime/src/index")`;',
            'const pattern = /from "..\\/..\\/runtime\\/src\\/index"/;',
            "export const value = [quoted, templated, pattern];",
        ].join("\n"),
        "packages/runtime/src/index.ts": "export const runtime = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), []);
});

test("AST extraction reports forbidden directions for every supported reference form", async () => {
    const root = await fixtureProject({
        "packages/contracts/src/index.ts": [
            'import { a } from "../../runtime/src/index";',
            'import "../../runtime/src/side-effect";',
            'export type { B } from "../../runtime/src/type-decl";',
            'export type C = import("../../runtime/src/type-position").C;',
            'export const d = import("../../runtime/src/dynamic");',
            'export const e = require("../../runtime/src/required");',
            'import f = require("../../runtime/src/import-equals");',
            "void [a, d, e, f];",
        ].join("\n"),
        "packages/runtime/src/index.ts": "export const runtime = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/dynamic）",
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/import-equals）",
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/index）",
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/required）",
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/side-effect）",
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/type-decl）",
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/type-position）",
    ]);
});

test("AST extraction fails with repository-relative path and parser message", async () => {
    const root = await fixtureProject({
        "packages/contracts/src/broken.ts": "export const broken = ;\n",
    });

    await assert.rejects(analyzeDependencies(root), (error) => {
        assert.match(error.message, /^无法解析源文件：packages\/contracts\/src\/broken\.ts：/);
        assert.match(error.message, /Unexpected token/);
        return true;
    });

    const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./check-dependencies.mjs", import.meta.url)), root],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /无法解析源文件：packages\/contracts\/src\/broken\.ts：/);
    assert.match(result.stderr, /Unexpected token/);
});

test("AST boundary applies file-level rules to require dynamic and type-position imports", async () => {
    const root = await fixtureProject({
        "packages/model-view/src/model-inference-view.ts": [
            'export type Goal = import("../../runtime/src/index").Goal;',
            'export const errors = require("../../runtime/src/errors");',
            'export const context = import("../../model-context/src/index");',
        ].join("\n"),
        "packages/runtime/src/index.ts": "export type Goal = true;\n",
        "packages/runtime/src/errors.ts": "export const errors = true;\n",
        "packages/model-context/src/index.ts": "export const context = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/model-view 不得导入 packages/model-context（packages/model-view/src/model-inference-view.ts 引用 ../../model-context/src/index）",
        "禁止依赖方向：packages/model-view 不得导入 packages/runtime（packages/model-view/src/model-inference-view.ts 引用 ../../runtime/src/errors）",
        "禁止依赖方向：packages/model-view 不得导入 packages/runtime（packages/model-view/src/model-inference-view.ts 引用 ../../runtime/src/index）",
        "边界违规：ModelInferenceView DTO 不得导入 packages/model-context（packages/model-view/src/model-inference-view.ts 引用 ../../model-context/src/index）",
        "边界违规：ModelInferenceView DTO 不得导入 packages/runtime（packages/model-view/src/model-inference-view.ts 引用 ../../runtime/src/errors）",
        "边界违规：ModelInferenceView DTO 不得导入 packages/runtime（packages/model-view/src/model-inference-view.ts 引用 ../../runtime/src/index）",
    ]);
});

test("AST boundary rejects every relative reference form in the agent entry", async () => {
    const root = await fixtureProject({
        "packages/agent/src/index.ts": [
            'export { createAgentExecutor } from "./create-agent-executor";',
            '// export { commented } from "./comment";',
            'const label = "export { quoted } from \\"./quoted\\"";',
            'export type Options = import("./types").Options;',
            'export const load = () => import("./dynamic");',
            'const legacy = require("./legacy");',
            "void [label, load, legacy];",
        ].join("\n"),
        "packages/agent/src/create-agent-executor.ts": "export const createAgentExecutor = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "入口约束：packages/agent 公共入口只能转发默认装配（packages/agent/src/index.ts 引用 ./dynamic）",
        "入口约束：packages/agent 公共入口只能转发默认装配（packages/agent/src/index.ts 引用 ./legacy）",
        "入口约束：packages/agent 公共入口只能转发默认装配（packages/agent/src/index.ts 引用 ./types）",
    ]);
});

test("AST boundary allows the default agent forwarding target and ignores pseudo references", async () => {
    const root = await fixtureProject({
        "packages/agent/src/index.ts": [
            'export { createAgentExecutor } from "./create-agent-executor";',
            '// export { commented } from "./comment";',
            'const label = `export { templated } from "./templated"`;',
            "void label;",
        ].join("\n"),
        "packages/agent/src/create-agent-executor.ts": "export const createAgentExecutor = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), []);
});

/** 构造统计读取与解析次数的 scanner，用于验证调用级缓存而不是总耗时。 */
async function countingScanner(root) {
    const reads = new Map();
    const parses = new Map();
    const scanner = createSourceScanner(root, {
        readFile: async (file) => {
            reads.set(file, (reads.get(file) ?? 0) + 1);
            return readFile(file, "utf8");
        },
        extractSpecifiers: (sourceText, relativePath) => {
            parses.set(relativePath, (parses.get(relativePath) ?? 0) + 1);
            return extractModuleSpecifiers(sourceText, relativePath);
        },
    });
    return { scanner, reads, parses };
}

test("AST cache reads and parses each file once across overlapping rule families", async () => {
    const root = await fixtureProject({
        "packages/runtime/src/checkpoint-gate.ts":
            'import { ProcessManager } from "../../process-runtime/src/errors";\nexport const RuntimeLifecycle = ProcessManager;\n',
        "packages/process-runtime/src/errors.ts": "export const ProcessManager = true;\n",
        "packages/process-runtime/src/index.ts": "export {};\n",
    });
    const { scanner, reads, parses } = await countingScanner(root);

    assert.deepEqual(await analyzeDependenciesWithScanner(root, scanner), [
        "禁止依赖方向：packages/runtime 不得导入 packages/process-runtime（packages/runtime/src/checkpoint-gate.ts 引用 ../../process-runtime/src/errors）",
        "组件入口违规：packages/runtime/src/checkpoint-gate.ts 必须通过 packages/process-runtime/src/index.ts 访问进程会话运行时（引用 ../../process-runtime/src/errors）",
    ]);

    const watchedFile = path.join(root, "packages", "runtime", "src", "checkpoint-gate.ts");
    assert.equal(reads.get(watchedFile), 1);
    assert.equal(parses.get("packages/runtime/src/checkpoint-gate.ts"), 1);
    for (const [file, count] of reads) assert.equal(count, 1, `${file} 被读取 ${count} 次`);
    for (const [file, count] of parses) assert.equal(count, 1, `${file} 被解析 ${count} 次`);
});

test("AST cache shares one read between text and concurrent specifier requests", async () => {
    const source = 'export {} from "../../runtime/src/index";\n';
    const root = await fixtureProject({
        "packages/contracts/src/index.ts": source,
        "packages/runtime/src/index.ts": "export {};\n",
    });
    const { scanner, reads, parses } = await countingScanner(root);
    const file = path.join(root, "packages", "contracts", "src", "index.ts");

    const [text, first, second] = await Promise.all([
        scanner.text(file),
        scanner.specifiers(file),
        scanner.specifiers(file),
    ]);

    assert.equal(text, source);
    assert.deepEqual(first, ["../../runtime/src/index"]);
    assert.deepEqual(second, ["../../runtime/src/index"]);
    assert.equal(reads.get(file), 1);
    assert.equal(parses.get("packages/contracts/src/index.ts"), 1);
});

test("AST cache does not leak file content between analysis calls", async () => {
    const file = "packages/contracts/src/index.ts";
    const root = await fixtureProject({
        [file]: '// import { fake } from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), []);

    await writeFile(
        path.join(root, file),
        'export {} from "../../runtime/src/index";\n',
    );

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/index）",
    ]);
});

test("AST cache isolates different project roots", async () => {
    const violatingRoot = await fixtureProject({
        "packages/contracts/src/index.ts": 'export {} from "../../runtime/src/index";\n',
        "packages/runtime/src/index.ts": "export {};\n",
    });
    const cleanRoot = await fixtureProject({
        "packages/contracts/src/index.ts": "export const contract = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(violatingRoot), [
        "禁止依赖方向：packages/contracts 不得导入 packages/runtime（packages/contracts/src/index.ts 引用 ../../runtime/src/index）",
    ]);
    assert.deepEqual(await analyzeDependencies(cleanRoot), []);
});

const PACKAGE_DIRECTION_CASES = [
    ["contracts", "runtime"],
    ["context-budget", "runtime"],
    ["model-view", "runtime"],
    ["model-context", "llm"],
    ["prompt-renderer", "runtime"],
    ["prompt-bundle", "contracts"],
    ["model-request", "agent"],
    ["model-response", "runtime"],
    ["model-call", "agent"],
    ["model-execution", "agent"],
    ["model-contracts", "runtime"],
    ["execution-stream", "contracts"],
    ["execution-control", "runtime"],
    ["context-retrieval", "runtime"],
    ["http", "contracts"],
    ["slash-command", "contracts"],
    ["acp", "contracts"],
    ["sandbox", "contracts"],
    ["permission", "runtime"],
    ["tool-core", "runtime"],
    ["working-memory", "runtime"],
    ["llm-core", "config"],
    ["llm-adapters", "config"],
    ["llm-google", "config"],
    ["llm-pi-ai", "config"],
    ["model-catalog", "llm-pi-ai"],
    ["config", "runtime"],
    ["runtime", "agent"],
    ["llm", "runtime"],
    ["storage", "agent"],
    ["agent", "browser"],
    ["session-metrics", "storage"],
    ["tools", "agent"],
    ["process-runtime", "contracts"],
    ["browser", "storage"],
    ["web-contracts", "runtime"],
];

test("包依赖方向逐包拒绝未允许的出站边", async () => {
    for (const [sourcePackage, targetPackage] of PACKAGE_DIRECTION_CASES) {
        const sourceFile = sourcePackage === "agent" ? "executor.ts" : "index.ts";
        const root = await fixtureProject({
            [`packages/${sourcePackage}/src/${sourceFile}`]:
                `export {} from "../../${targetPackage}/src/index";\n`,
            [`packages/${targetPackage}/src/index.ts`]: "export {};\n",
        });

        assert.deepEqual(await analyzeDependencies(root), [
            `禁止依赖方向：packages/${sourcePackage} 不得导入 packages/${targetPackage}（packages/${sourcePackage}/src/${sourceFile} 引用 ../../${targetPackage}/src/index）`,
        ], `${sourcePackage} -> ${targetPackage}`);
    }
});

test("app 依赖方向逐 app 拒绝未允许的包", async () => {
    for (const [sourceApp, targetPackage] of [
        ["goal-board", "agent"],
        ["goal-server", "acp"],
    ]) {
        const root = await fixtureProject({
            [`apps/${sourceApp}/src/index.ts`]:
                `export {} from "../../../packages/${targetPackage}/src/index";\n`,
            [`packages/${targetPackage}/src/index.ts`]: "export {};\n",
        });

        assert.deepEqual(await analyzeDependencies(root), [
            `禁止依赖方向：apps/${sourceApp} 不得导入 packages/${targetPackage}（apps/${sourceApp}/src/index.ts 引用 ../../../packages/${targetPackage}/src/index）`,
        ], `${sourceApp} -> ${targetPackage}`);
    }
});

test("rejects imports between different apps", async () => {
    const root = await fixtureProject({
        "apps/goal-server/src/index.ts":
            'export {} from "../../../apps/goal-board/src/index";\n',
        "apps/goal-board/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止应用交叉依赖：apps/goal-server 不得导入 apps/goal-board（apps/goal-server/src/index.ts 引用 ../../../apps/goal-board/src/index）",
    ]);
});

const FILE_BOUNDARY_CASES = [
    ["packages/model-view/src/model-inference-view.ts", "ModelInferenceView DTO"],
    ["packages/model-view/src/model-history-view.ts", "模型历史结果 DTO"],
    ["packages/model-request/src/render.ts", "Prompt 请求渲染器"],
    ["packages/storage/src/goal-snapshot.ts", "Goal Snapshot DTO/Schema"],
    ["packages/storage/src/agent-profile-file.ts", "AgentProfile 文件 DTO/Schema"],
];

test("文件级边界逐文件拒绝 Runtime 引用", async () => {
    for (const [relativePath, label] of FILE_BOUNDARY_CASES) {
        const root = await fixtureProject({
            [relativePath]: 'export type Leak = import("../../runtime/src/index").Leak;\n',
            "packages/runtime/src/index.ts": "export type Leak = true;\n",
        });

        assert.deepEqual(
            (await analyzeDependencies(root)).filter((violation) => violation.startsWith("边界违规：")),
            [`边界违规：${label} 不得导入 packages/runtime（${relativePath} 引用 ../../runtime/src/index）`],
            relativePath,
        );
    }
});

test("文件级边界允许未禁止的包引用", async () => {
    for (const [relativePath] of FILE_BOUNDARY_CASES) {
        const root = await fixtureProject({
            [relativePath]: 'export type Allowed = import("../../model-contracts/src/index").Allowed;\n',
            "packages/model-contracts/src/index.ts": "export type Allowed = true;\n",
        });

        assert.deepEqual(await analyzeDependencies(root), [], relativePath);
    }
});

test("allows benchmark shared-layer and same-benchmark imports", async () => {
    const root = await fixtureProject({
        "benchmarks/gaia/src/index.ts":
            'export { run } from "./worker";\nexport { shared } from "../../src/shared";\n',
        "benchmarks/gaia/src/worker.ts": "export const run = true;\n",
        "benchmarks/src/shared.ts": "export const shared = true;\n",
    });

    assert.deepEqual(await analyzeDependencies(root), []);
});

test("allows vendor SDK imports outside SDK-free packages", async () => {
    const root = await fixtureProject({
        "packages/llm-google/src/index.ts": [
            'import OpenAI from "openai";',
            'import type { GoogleGenAI } from "@google/genai";',
            "export const client = OpenAI;\nexport type Client = GoogleGenAI;",
        ].join("\n"),
    });

    assert.deepEqual(await analyzeDependencies(root), []);
});
