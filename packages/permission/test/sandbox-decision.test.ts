import assert from "node:assert/strict";
import { test } from "node:test";

import {
    evaluateSandboxAuthorization,
    NETWORK_ALL_OUTBOUND_NOTICE,
    type EffectiveSandboxReview,
    type SandboxAuthorizationContext,
} from "../src/index";

test("macOS 默认沙箱范围（无额外文件与网络）直接放行 allow", () => {
    const context: SandboxAuthorizationContext = {
        isSeatbeltSupported: true,
        workspaceRoot: "/workspace",
        effectiveScope: {
            extraFiles: [],
            network: "none",
        },
    };

    const decision = evaluateSandboxAuthorization(context);
    assert.deepEqual(decision, { decision: "allow" });
});

test("macOS 越界文件访问判定为 approval_required 并生成准确审阅视图", () => {
    const context: SandboxAuthorizationContext = {
        isSeatbeltSupported: true,
        workspaceRoot: "/workspace",
        effectiveScope: {
            extraFiles: [
                { canonicalPath: "/etc/hosts", access: "read", kind: "file" },
                { canonicalPath: "/var/log", access: "write", kind: "directory_tree" },
            ],
            network: "none",
        },
    };

    const decision = evaluateSandboxAuthorization(context);
    assert.equal(decision.decision, "approval_required");
    if (decision.decision === "approval_required") {
        assert.deepEqual(decision.review.extraFiles, context.effectiveScope.extraFiles);
        assert.equal(decision.review.network, "none");
        assert.equal(decision.review.networkNotice, undefined);
    }
});

test("macOS 越界网络访问判定为 approval_required 并明示整网与回环范围", () => {
    const context: SandboxAuthorizationContext = {
        isSeatbeltSupported: true,
        workspaceRoot: "/workspace",
        effectiveScope: {
            extraFiles: [],
            network: "all_outbound",
        },
    };

    const decision = evaluateSandboxAuthorization(context);
    assert.equal(decision.decision, "approval_required");
    if (decision.decision === "approval_required") {
        assert.equal(decision.review.network, "all_outbound");
        assert.equal(decision.review.networkNotice, NETWORK_ALL_OUTBOUND_NOTICE);
        assert.match(decision.review.networkNotice, /任意出站目标/);
        assert.match(decision.review.networkNotice, /回环/);
    }
});

test("非 macOS 平台无需内核沙箱能力审批，直接放行", () => {
    const context: SandboxAuthorizationContext = {
        isSeatbeltSupported: false,
        workspaceRoot: "/workspace",
        effectiveScope: {
            extraFiles: [{ canonicalPath: "/etc/hosts", access: "write", kind: "file" }],
            network: "all_outbound",
        },
    };

    const decision = evaluateSandboxAuthorization(context);
    assert.deepEqual(decision, { decision: "allow" });
});
