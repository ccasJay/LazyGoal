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
