import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    analyzeDependencies,
    checkDependencies,
} from "./check-dependencies.mjs";

const EXISTING_PACKAGES = ["runtime", "llm", "llm-core", "llm-google", "storage", "agent", "tools"];

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

test("allows llm-openai to consume llm-core and rejects application config edges", async () => {
    const root = await fixtureProject({
        "packages/llm-core/src/index.ts": "export const core = true;\n",
        "packages/llm-openai/src/index.ts": 'export { core } from "../../llm-core/src/index";\nexport {} from "../../config/src/index";\n',
        "packages/config/src/index.ts": "export {};\n",
    });

    assert.deepEqual(await analyzeDependencies(root), [
        "禁止依赖方向：packages/llm-openai 不得导入 packages/config（packages/llm-openai/src/index.ts 引用 ../../config/src/index）",
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
