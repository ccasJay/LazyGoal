import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildSeatbeltPolicy, getSandboxProtectionStatus } from "../src/index";

const WORKSPACE = "/Users/test/workspace";
const PRIVATE_TMP = "/tmp/sandbox-123";
const EXTRA_WRITE = "/Users/test/cache";

function extractRule(policy: string, rule: string): string {
    const start = policy.indexOf(rule);
    assert.notEqual(start, -1, `策略缺少规则: ${rule}`);

    let depth = 0;
    for (let index = start; index < policy.length; index += 1) {
        const char = policy.charAt(index);
        if (char === "(") {
            depth += 1;
        } else if (char === ")") {
            depth -= 1;
            if (depth === 0) {
                return policy.slice(start, index + 1);
            }
        }
    }

    throw new Error(`规则未闭合: ${rule}`);
}

describe("macOS Seatbelt 沙箱档位策略", () => {
    it("workspace-write 保持工作区与额外写入路径可写", () => {
        const policy = buildSeatbeltPolicy({
            canonicalWorkspaceRoot: WORKSPACE,
            privateTmpDir: PRIVATE_TMP,
            extraWritePaths: [EXTRA_WRITE],
        });

        const writeRule = extractRule(policy, "(allow file-write*");
        assert.ok(writeRule.includes(`(subpath "${WORKSPACE}")`));
        assert.ok(writeRule.includes(`(subpath "${PRIVATE_TMP}")`));
        assert.ok(writeRule.includes(`(subpath "${EXTRA_WRITE}")`));
        assert.ok(!policy.includes("(allow file-write*)"));

        const readRule = extractRule(policy, "(allow file-read*");
        assert.ok(readRule.includes(`(subpath "${WORKSPACE}")`));
    });

    it("read-only 取消工作区写入但保留 /dev、私有临时目录写入与 .lazygoal 拒绝", () => {
        const policy = buildSeatbeltPolicy({
            canonicalWorkspaceRoot: WORKSPACE,
            privateTmpDir: PRIVATE_TMP,
            extraWritePaths: [EXTRA_WRITE],
            sandboxMode: "read-only",
        });

        const writeRule = extractRule(policy, "(allow file-write*");
        assert.ok(!writeRule.includes(`(subpath "${WORKSPACE}")`));
        assert.ok(!writeRule.includes(`(subpath "${EXTRA_WRITE}")`));
        assert.ok(writeRule.includes(`(subpath "${PRIVATE_TMP}")`));
        assert.ok(!policy.includes("(allow file-write*)"));

        const devWriteRule = extractRule(policy, "(allow file-write-data");
        assert.match(devWriteRule, /\(literal "\/dev\/null"\)/);
        assert.match(devWriteRule, /\(literal "\/dev\/stdout"\)/);

        const readRule = extractRule(policy, "(allow file-read*");
        assert.ok(readRule.includes(`(subpath "${WORKSPACE}")`));
        assert.ok(readRule.includes(`(subpath "${EXTRA_WRITE}")`));
        assert.match(readRule, /\(subpath "\/dev"\)/);

        const denyRule = extractRule(policy, "(deny file-write*");
        assert.ok(denyRule.includes(`(subpath "${WORKSPACE}/.lazygoal")`));
    });

    it("danger-full-access 放行全局读写但保持 .lazygoal 与受保护路径写拒绝", () => {
        const protectedPath = join(WORKSPACE, ".git");
        const policy = buildSeatbeltPolicy({
            canonicalWorkspaceRoot: WORKSPACE,
            privateTmpDir: PRIVATE_TMP,
            protectedPaths: [protectedPath],
            sandboxMode: "danger-full-access",
        });

        assert.ok(policy.includes("(allow file-read*)"));
        assert.ok(policy.includes("(allow file-write*)"));

        const denyRule = extractRule(policy, "(deny file-write*");
        assert.ok(denyRule.includes(`(subpath "${WORKSPACE}/.lazygoal")`));
        assert.ok(denyRule.includes(`(subpath "${join(homedir(), ".lazygoal")}")`));
        assert.ok(denyRule.includes(`(subpath "${protectedPath}")`));
    });

    it("danger-full-access 仍按 network 参数决定是否放行出站网络", () => {
        const base = {
            canonicalWorkspaceRoot: WORKSPACE,
            privateTmpDir: PRIVATE_TMP,
            sandboxMode: "danger-full-access" as const,
        };

        assert.doesNotMatch(buildSeatbeltPolicy({ ...base, network: "none" }), /network-outbound/);
        assert.match(
            buildSeatbeltPolicy({ ...base, network: "all_outbound" }),
            /\(allow network-outbound\)/,
        );
    });

    it("平台无法强制边界时报告未强制及可读原因", () => {
        const status = getSandboxProtectionStatus("linux");

        assert.equal(status.backend, "unsupported");
        assert.equal(status.isProtected, false);
        assert.match(status.description, /linux/);
        assert.match(status.description, /文件与网络边界未强制/);
    });
});
