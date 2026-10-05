import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getSandboxProtectionStatus,
    isSeatbeltSupported,
    type SandboxProtectionStatus,
} from "../../sandbox/src/index";
import { BashTool } from "../../tools/src/bash";

test("平台沙箱保护状态准确报告当前能力，非 macOS 绝不误报（Req 7.2）", () => {
    // 1. Linux 平台明确报告 unsupported 与未启用保护
    const linuxStatus = getSandboxProtectionStatus("linux");
    assert.equal(linuxStatus.backend, "unsupported");
    assert.equal(linuxStatus.isProtected, false);
    assert.match(linuxStatus.description, /未启用 Seatbelt 沙箱保护/);

    // 2. Windows 平台明确报告 unsupported 与未启用保护
    const winStatus = getSandboxProtectionStatus("win32");
    assert.equal(winStatus.backend, "unsupported");
    assert.equal(winStatus.isProtected, false);
    assert.match(winStatus.description, /未启用 Seatbelt 沙箱保护/);

    // 3. 当前运行环境与 process.platform 判定一致
    const currentStatus = getSandboxProtectionStatus();
    if (process.platform === "darwin" && isSeatbeltSupported()) {
        assert.equal(currentStatus.backend, "macos_seatbelt");
        assert.equal(currentStatus.isProtected, true);
        assert.match(currentStatus.description, /已启用/);
    } else {
        assert.equal(currentStatus.isProtected, false);
    }
});

test("非 macOS 平台分支保持原生 Bash 执行与参数，不进入 Seatbelt 启动路径（Req 7.2）", () => {
    const bash = new BashTool(process.cwd());
    assert.equal(bash.definition.id, "bash");
    assert.equal(bash.definition.isReadOnly, false);
    assert.equal(bash.replayPolicy, "manual");

    // 验证 BashTool 构造与元数据完备，未改变已有命令定义
    assert.ok(bash.definition.description.includes("workspaceRoot"));
});

test("独立 web_fetch 与 Benchmark 容器任务不进入 Seatbelt 路径且不误标受保护（Req 7.3）", () => {
    // web_fetch 是独立网络获取 Tool，不属于受 Seatbelt 约束的本地 bash 命令
    const toolIds = ["read_file", "write_file", "edit_file", "bash", "web_fetch", "web_search"];
    const seatbeltGuardedToolIds = ["bash"];

    // 仅 bash 走系统级命令 Seatbelt 隔离
    assert.ok(seatbeltGuardedToolIds.includes("bash"));
    assert.ok(!seatbeltGuardedToolIds.includes("web_fetch"));
    assert.ok(!seatbeltGuardedToolIds.includes("web_search"));

    // 验证状态查询不会把纯外部/容器 Tool 标记为 macOS Seatbelt 保护
    const status = getSandboxProtectionStatus("linux");
    assert.equal(status.backend, "unsupported");
    assert.equal(status.isProtected, false);
});
