import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    analyzeDependencies,
    checkDependencies,
} from "./check-dependencies.mjs";

const EXISTING_PACKAGES = ["runtime", "llm", "storage", "agent", "tools", "tui"];

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
