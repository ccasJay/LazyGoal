import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_PERMISSION_PROFILE,
    evaluatePermissionBoundary,
    isDestructiveCommand,
    PERMISSION_PRESETS,
    type EffectiveExtraFile,
    type PermissionBoundaryDecision,
    type PermissionBoundaryRequest,
    type PermissionProfile,
    type SandboxMode,
} from "../src/index";

const WORKSPACE = "/Users/me/project";
const SANDBOX_MODES: readonly SandboxMode[] = [
    "read-only",
    "workspace-write",
    "danger-full-access",
];

const ADJUDICATIONS = [
    { approvals: "on-request", reviewer: "user" },
    { approvals: "on-request", reviewer: "auto_review" },
    { approvals: "never", reviewer: "user" },
] as const;

function profile(sandbox: SandboxMode, adjudication: typeof ADJUDICATIONS[number], writableRoots: readonly string[] = []): PermissionProfile {
    return { sandbox, approvals: adjudication.approvals, reviewer: adjudication.reviewer, writableRoots };
}

function request(
    effectiveScope: PermissionBoundaryRequest["effectiveScope"],
    overrides: Partial<PermissionBoundaryRequest> = {},
): PermissionBoundaryRequest {
    return {
        toolId: "bash",
        effectiveScope,
        workspaceRoot: WORKSPACE,
        ...overrides,
    };
}

function file(canonicalPath: string, access: "read" | "write"): EffectiveExtraFile {
    return { canonicalPath, access, kind: "file" };
}

function decide(permissionProfile: PermissionProfile, boundaryRequest: PermissionBoundaryRequest): PermissionBoundaryDecision {
    return evaluatePermissionBoundary({ profile: permissionProfile, request: boundaryRequest });
}

function assertAllow(decision: PermissionBoundaryDecision, source: "profile" | "auto_review", message: string): void {
    assert.equal(decision.kind, "allow", message);
    if (decision.kind === "allow") assert.equal(decision.source, source, message);
}

function assertApproval(decision: PermissionBoundaryDecision, risk: readonly string[], message: string): void {
    assert.equal(decision.kind, "approval", message);
    if (decision.kind === "approval") {
        assert.equal(decision.approvalKind, "sandbox", message);
        assert.deepEqual(decision.risk, risk, message);
    }
}

test("默认档位为 Ask：workspace-write、on-request、user、无额外可写根", () => {
    assert.deepEqual(DEFAULT_PERMISSION_PROFILE, {
        sandbox: "workspace-write",
        approvals: "on-request",
        reviewer: "user",
        writableRoots: [],
    });
    assert.equal(DEFAULT_PERMISSION_PROFILE, PERMISSION_PRESETS.ask);
    assert.equal(PERMISSION_PRESETS.auto.reviewer, "auto_review");
    assert.equal(PERMISSION_PRESETS.full.sandbox, "danger-full-access");
    assert.equal(PERMISSION_PRESETS.full.approvals, "never");
});

test("工作区树内读取在所有档位与裁决配置下都直接执行", () => {
    for (const sandbox of SANDBOX_MODES) {
        for (const adjudication of ADJUDICATIONS) {
            const decision = decide(
                profile(sandbox, adjudication),
                request({ extraFiles: [file(`${WORKSPACE}/src/index.ts`, "read")], network: "none" }),
            );
            assertAllow(decision, "profile", `${sandbox}/${adjudication.reviewer}/${adjudication.approvals}`);
        }
    }
});

test("工作区树内写入在 read-only 下拒绝，在 workspace-write 与 danger-full-access 下直接执行", () => {
    for (const adjudication of ADJUDICATIONS) {
        const readOnlyDecision = decide(
            profile("read-only", adjudication),
            request({ extraFiles: [file(`${WORKSPACE}/src/index.ts`, "write")], network: "none" }),
        );
        assert.equal(readOnlyDecision.kind, "deny", `${adjudication.reviewer}/${adjudication.approvals}`);
        if (readOnlyDecision.kind === "deny") {
            assert.match(readOnlyDecision.reason, /read-only/);
            assert.match(readOnlyDecision.reason, /src\/index\.ts/);
        }

        for (const sandbox of ["workspace-write", "danger-full-access"] as const) {
            const allowed = decide(
                profile(sandbox, adjudication),
                request({ extraFiles: [file(`${WORKSPACE}/src/index.ts`, "write")], network: "none" }),
            );
            assertAllow(allowed, "profile", `${sandbox}/${adjudication.reviewer}/${adjudication.approvals}`);
        }
    }
});

test(".git 读取属于边界 baseline，不产生审批", () => {
    for (const sandbox of SANDBOX_MODES) {
        for (const adjudication of ADJUDICATIONS) {
            const decision = decide(
                profile(sandbox, adjudication),
                request({
                    extraFiles: [file(`${WORKSPACE}/.git/HEAD`, "read")],
                    network: "none",
                }),
            );
            assertAllow(decision, "profile", `${sandbox}/${adjudication.reviewer}/${adjudication.approvals}`);
        }
    }
});

test(".git 写入在 workspace-write 下按越界处理：user 与 auto_review 需裁决，never 拒绝", () => {
    const gitPath = `${WORKSPACE}/.git/config`;

    for (const adjudication of ADJUDICATIONS) {
        const decision = decide(
            profile("workspace-write", adjudication),
            request({ extraFiles: [file(gitPath, "write")], network: "none" }),
        );
        const label = `${adjudication.reviewer}/${adjudication.approvals}`;

        if (adjudication.approvals === "never") {
            assert.equal(decision.kind, "deny", label);
            if (decision.kind === "deny") assert.match(decision.reason, /git_write/);
            continue;
        }

        assertApproval(decision, ["git_write"], label);
        if (decision.kind === "approval") {
            assert.match(decision.reason, /\.git\/config/);
        }
    }

    for (const adjudication of ADJUDICATIONS) {
        const readOnlyDecision = decide(
            profile("read-only", adjudication),
            request({ extraFiles: [file(gitPath, "write")], network: "none" }),
        );
        assert.equal(readOnlyDecision.kind, "deny", `read-only/${adjudication.reviewer}`);

        const fullDecision = decide(
            profile("danger-full-access", adjudication),
            request({ extraFiles: [file(gitPath, "write")], network: "none" }),
        );
        assertAllow(fullDecision, "profile", `danger-full-access/${adjudication.reviewer}`);
    }
});

test("writableRoots 内的读写不越界，前缀相同的兄弟目录仍属工作区外", () => {
    const writableRoots = ["/Users/me/shared"];

    for (const adjudication of ADJUDICATIONS) {
        for (const access of ["read", "write"] as const) {
            const insideRoot = decide(
                profile("workspace-write", adjudication, writableRoots),
                request({ extraFiles: [file("/Users/me/shared/data/input.csv", access)], network: "none" }),
            );
            assertAllow(insideRoot, "profile", `writableRoots/${access}/${adjudication.reviewer}`);

            const siblingPrefix = decide(
                profile("workspace-write", adjudication, writableRoots),
                request({ extraFiles: [file("/Users/me/shared-other/secret.txt", access)], network: "none" }),
            );
            if (adjudication.approvals === "never") {
                assert.equal(siblingPrefix.kind, "deny", `sibling/${access}/${adjudication.reviewer}`);
            } else if (adjudication.reviewer === "auto_review" && access === "read") {
                assertAllow(siblingPrefix, "auto_review", `sibling/${access}/auto_review`);
            } else {
                assertApproval(
                    siblingPrefix,
                    access === "write" ? ["outside_write"] : [],
                    `sibling/${access}/${adjudication.reviewer}`,
                );
            }
        }
    }

    const rootGitWrite = decide(
        profile("workspace-write", { approvals: "never", reviewer: "user" }, writableRoots),
        request({ extraFiles: [file("/Users/me/shared/.git/config", "write")], network: "none" }),
    );
    assertAllow(rootGitWrite, "profile", "writableRoots 内的 .git 写入不属于工作区越界");
});

test("工作区外读取在 user 与 auto_review 下分别裁决，never 直接拒绝", () => {
    const boundaryRequest = request({ extraFiles: [file("/etc/hosts", "read")], network: "none" });

    const neverDecision = decide(profile("workspace-write", { approvals: "never", reviewer: "user" }), boundaryRequest);
    assert.equal(neverDecision.kind, "deny");
    if (neverDecision.kind === "deny") {
        assert.match(neverDecision.reason, /never/);
        assert.match(neverDecision.reason, /workspace-write/);
        assert.match(neverDecision.reason, /\/etc\/hosts/);
    }

    const userDecision = decide(profile("workspace-write", { approvals: "on-request", reviewer: "user" }), boundaryRequest);
    assertApproval(userDecision, [], "user 审阅越界读取");
    if (userDecision.kind === "approval") assert.match(userDecision.reason, /\/etc\/hosts/);

    const autoDecision = decide(profile("workspace-write", { approvals: "on-request", reviewer: "auto_review" }), boundaryRequest);
    assertAllow(autoDecision, "auto_review", "auto_review 未命中规则表时自动放行");
});

test("工作区外写入命中 outside_write 规则：user 与 auto_review 都需裁决", () => {
    const boundaryRequest = request({ extraFiles: [file("/var/log/app.log", "write")], network: "none" });

    for (const adjudication of ADJUDICATIONS.filter(item => item.approvals === "on-request")) {
        const decision = decide(profile("workspace-write", adjudication), boundaryRequest);
        assertApproval(decision, ["outside_write"], adjudication.reviewer);
        if (decision.kind === "approval") assert.match(decision.reason, /\/var\/log\/app\.log/);
    }

    const fullDecision = decide(PERMISSION_PRESETS.full, boundaryRequest);
    assertAllow(fullDecision, "profile", "danger-full-access 取消文件边界");
});

test("出站网络在 ask 与 auto 下都需要裁决，full 直接放行", () => {
    const boundaryRequest = request({ extraFiles: [], network: "all_outbound" });

    assertApproval(decide(PERMISSION_PRESETS.ask, boundaryRequest), ["network"], "ask");
    assertApproval(decide(PERMISSION_PRESETS.auto, boundaryRequest), ["network"], "auto");
    assertAllow(decide(PERMISSION_PRESETS.full, boundaryRequest), "profile", "full");

    const neverDecision = decide(
        profile("workspace-write", { approvals: "never", reviewer: "user" }),
        boundaryRequest,
    );
    assert.equal(neverDecision.kind, "deny");
});

test("破坏性命令即使只访问工作区树内也计为越界", () => {
    const boundaryRequest = request(
        { extraFiles: [file(`${WORKSPACE}/build`, "write")], network: "none" },
        { destructiveCommand: true },
    );

    assertApproval(decide(PERMISSION_PRESETS.ask, boundaryRequest), ["destructive_command"], "ask");

    const autoDecision = decide(PERMISSION_PRESETS.auto, boundaryRequest);
    assertApproval(autoDecision, ["destructive_command"], "auto");
    if (autoDecision.kind === "approval") assert.match(autoDecision.reason, /destructive command/);

    const neverDecision = decide(
        profile("workspace-write", { approvals: "never", reviewer: "user" }),
        boundaryRequest,
    );
    assert.equal(neverDecision.kind, "deny");
});

test("多个越界项的风险类别去重并按固定顺序报告", () => {
    const decision = decide(
        PERMISSION_PRESETS.ask,
        request(
            {
                extraFiles: [
                    file("/var/log/app.log", "write"),
                    file("/etc/hosts", "read"),
                    file(`${WORKSPACE}/.git/index`, "write"),
                ],
                network: "all_outbound",
            },
            { destructiveCommand: true },
        ),
    );

    assertApproval(decision, ["outside_write", "network", "destructive_command", "git_write"], "risk 顺序");
    if (decision.kind === "approval") {
        assert.match(decision.reason, /\/var\/log\/app\.log/);
        assert.match(decision.reason, /\/etc\/hosts/);
        assert.match(decision.reason, /\.git\/index/);
    }
});

test(".lazygoal 内部状态在任何档位与访问方向下都拒绝", () => {
    for (const sandbox of SANDBOX_MODES) {
        for (const adjudication of ADJUDICATIONS) {
            for (const access of ["read", "write"] as const) {
                for (const target of [`${WORKSPACE}/.lazygoal`, `${WORKSPACE}/.lazygoal/goals/goal-1.json`]) {
                    const decision = decide(
                        profile(sandbox, adjudication),
                        request({ extraFiles: [file(target, access)], network: "all_outbound" }),
                    );
                    assert.equal(decision.kind, "deny", `${sandbox}/${adjudication.reviewer}/${access}/${target}`);
                    if (decision.kind === "deny") {
                        assert.match(decision.reason, /LazyGoal internal state/);
                        assert.match(decision.reason, /\.lazygoal/);
                    }
                }
            }
        }
    }
});

test("边界内的 Action 不产生裁决，也不区分 risk", () => {
    const decision = decide(
        PERMISSION_PRESETS.ask,
        request({
            extraFiles: [
                file(`${WORKSPACE}/README.md`, "read"),
                file(`${WORKSPACE}/src/main.ts`, "write"),
                file(`${WORKSPACE}/.git/refs/heads/main`, "read"),
            ],
            network: "none",
        }),
    );
    assert.deepEqual(decision, { kind: "allow", source: "profile" });
});

test("isDestructiveCommand 只匹配显式规则表列出的写法", () => {
    for (const command of [
        "rm -rf build",
        "rm -fr build",
        "rm -Rf ./dist",
        "git reset --hard HEAD~1",
        "git clean -fdx",
        "git push --force origin main",
        "git push -f origin main",
        "dd if=/dev/zero of=/dev/disk2",
        "mkfs.ext4 /dev/disk2",
        "shutdown -h now",
        "reboot",
    ]) {
        assert.equal(isDestructiveCommand(command), true, command);
    }

    for (const command of [
        "rm file",
        "rm -i file",
        "git reset HEAD~1",
        "git clean -n",
        "git push origin main",
        "cat /dev/zero",
        "npm test",
    ]) {
        assert.equal(isDestructiveCommand(command), false, command);
    }
});
