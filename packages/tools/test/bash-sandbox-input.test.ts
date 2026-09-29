import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BashTool } from "../src/bash";

describe("BashTool Sandbox Input Validation & Approval Gate", () => {
    const tool = new BashTool(process.cwd());

    it("校验合法的 sandboxAccess 输入", () => {
        const validRes = tool.validate({
            command: "echo test",
            sandboxAccess: {
                files: [
                    {
                        path: "../data/file.txt",
                        access: "read",
                        kind: "file",
                        purpose: "读取配置",
                    },
                    {
                        path: "/tmp/cache",
                        access: "write",
                        kind: "directory_tree",
                        purpose: "写入缓存目录",
                    },
                ],
                network: {
                    targets: ["api.github.com", "npm.org"],
                    purpose: "下载依赖包",
                },
            },
        });

        assert.equal(validRes.ok, true);
    });

    it("拒绝非法的 sandboxAccess.files 输入", () => {
        // 空路径
        const emptyPath = tool.validate({
            command: "echo test",
            sandboxAccess: {
                files: [{ path: "   ", access: "read", kind: "file", purpose: "读取" }],
            },
        });
        assert.equal(emptyPath.ok, false);
        if (!emptyPath.ok) {
            assert.match(emptyPath.error.message, /path 不能为空/);
        }

        // NUL 字符
        const nulPath = tool.validate({
            command: "echo test",
            sandboxAccess: {
                files: [{ path: "a\0b", access: "read", kind: "file", purpose: "读取" }],
            },
        });
        assert.equal(nulPath.ok, false);
        if (!nulPath.ok) {
            assert.match(nulPath.error.message, /不能包含 NUL/);
        }

        // 空用途说明
        const emptyPurpose = tool.validate({
            command: "echo test",
            sandboxAccess: {
                files: [{ path: "a.txt", access: "read", kind: "file", purpose: "   " }],
            },
        });
        assert.equal(emptyPurpose.ok, false);
        if (!emptyPurpose.ok) {
            assert.match(emptyPurpose.error.message, /purpose 不能为空/);
        }
    });

    it("拒绝非法的 sandboxAccess.network 输入", () => {
        // 空 targets
        const emptyTargets = tool.validate({
            command: "echo test",
            sandboxAccess: {
                network: { targets: [], purpose: "联网" },
            },
        });
        assert.equal(emptyTargets.ok, false);
        if (!emptyTargets.ok) {
            assert.match(emptyTargets.error.message, /targets 不能为空列表/);
        }

        // targets 包含空白目标
        const blankTarget = tool.validate({
            command: "echo test",
            sandboxAccess: {
                network: { targets: ["  "], purpose: "联网" },
            },
        });
        assert.equal(blankTarget.ok, false);
        if (!blankTarget.ok) {
            assert.match(blankTarget.error.message, /包含空目标/);
        }

        // 空用途
        const blankPurpose = tool.validate({
            command: "echo test",
            sandboxAccess: {
                network: { targets: ["example.com"], purpose: "" },
            },
        });
        assert.equal(blankPurpose.ok, false);
        if (!blankPurpose.ok) {
            assert.match(blankPurpose.error.message, /purpose 不能为空/);
        }
    });

    it("申请额外能力且无 plan 时拒绝执行并返回 SANDBOX_APPROVAL_REQUIRED", async () => {
        const res = await tool.execute({
            actionId: "action-sandbox-unapproved",
            input: {
                command: "echo test",
                sandboxAccess: {
                    network: { targets: ["example.com"], purpose: "测试联网" },
                },
            },
        });

        assert.equal(res.kind, "failure");
        assert.equal(res.code, "SANDBOX_APPROVAL_REQUIRED");
        assert.match(res.message, /须经 Permission 核准后方可执行/);
    });
});
