import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const BIN_PATH = resolve(ROOT, "bin/lazygoal.cjs");

test("lazygoal CLI eval gaia 显式拒绝 --tui 选项并返回退出码 2", () => {
    const res = spawnSync(process.execPath, [BIN_PATH, "eval", "gaia", "--tui", "--manifest", "m.json"], {
        encoding: "utf8",
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /--tui 交互模式已被移除/);
});

test("lazygoal CLI eval swebench 显式拒绝 --tui 选项并返回退出码 2", () => {
    const res = spawnSync(process.execPath, [BIN_PATH, "eval", "swebench", "--tui", "--manifest", "m.json"], {
        encoding: "utf8",
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /--tui 交互模式已被移除/);
});

test("lazygoal CLI grade swebench 缺少参数返回退出码 2", () => {
    const res = spawnSync(process.execPath, [BIN_PATH, "grade", "swebench"], {
        encoding: "utf8",
    });
    assert.equal(res.status, 2);
});

test("lazygoal CLI 显式拒绝旧终端命令 -c / resume / inspect 并返回退出码 2", () => {
    for (const cmd of ["-c", "resume", "inspect"]) {
        const res = spawnSync(process.execPath, [BIN_PATH, cmd], {
            encoding: "utf8",
        });
        assert.equal(res.status, 2, `command ${cmd} should exit with code 2`);
        assert.match(res.stderr, /已被移除.*lazygoal.*web/);
    }
});
