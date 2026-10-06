import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("普通 CLI 路由保持 Web 默认入口，显式评测参数才加载对应 benchmark", async () => {
    const source = await readFile(
        fileURLToPath(new URL("../../bin/lazygoal.cjs", import.meta.url)),
        "utf8",
    );

    assert.match(source, /argv\[0\] === "eval" && argv\[1\] === "alfworld"/);
    assert.match(source, /apps\/goal-server\/src\/cli\.ts/);
    assert.match(source, /benchmarks\/alfworld\/src\/cli\.ts/);
    assert.match(source, /argv\[0\] === "eval" && argv\[1\] === "swebench"/);
    assert.match(source, /benchmarks\/swebench\/src\/cli\.ts/);
});

test("GEPA TUA 数据检查走 TypeScript CLI，其它控制面命令走 Python", async () => {
    const source = await readFile(
        fileURLToPath(new URL("../../bin/lazygoal.cjs", import.meta.url)),
        "utf8",
    );

    assert.match(source, /const isGepaReflect = argv\[0\] === "gepa" && argv\[1\] === "reflect";/);
    assert.match(source, /const isGepaResolveModels = argv\[0\] === "gepa" && argv\[1\] === "resolve-models";/);
    assert.match(source, /const isGepaInspectTua = argv\[0\] === "gepa" && argv\[1\] === "inspect-tua";/);
    assert.match(source, /const isGepaAuditTuaCandidate = argv\[0\] === "gepa" && argv\[1\] === "audit-tua-candidate";/);
    assert.match(source, /const isGepaLifecycle = argv\[0\] === "gepa" && !isGepaReflect && !isGepaResolveModels && !isGepaInspectTua && !isGepaAuditTuaCandidate;/);
    assert.match(source, /isPromptEval \|\| isGepaReflect \|\| isGepaResolveModels \|\| isGepaInspectTua \|\| isGepaAuditTuaCandidate/);
    assert.match(source, /lazygoal_gepa\.cli/);
    assert.match(source, /LAZYGOAL_GEPA_PYTHON/);
});
