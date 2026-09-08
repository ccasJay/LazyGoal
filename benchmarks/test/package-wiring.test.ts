import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("普通 CLI 路由保持 TUI 默认入口，显式评测参数才加载对应 benchmark", async () => {
    const source = await readFile(
        fileURLToPath(new URL("../../bin/lazygoal.cjs", import.meta.url)),
        "utf8",
    );

    assert.match(source, /argv\[0\] === "eval" && argv\[1\] === "alfworld"/);
    assert.match(source, /packages\/tui\/src\/cli\.tsx/);
    assert.match(source, /benchmarks\/alfworld\/src\/cli\.ts/);
    assert.match(source, /argv\[0\] === "eval" && argv\[1\] === "swebench"/);
    assert.match(source, /benchmarks\/swebench\/src\/cli\.ts/);
});
