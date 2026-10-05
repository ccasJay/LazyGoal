import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    isSeatbeltSupported,
    resolveEffectiveSandboxScope,
    type SandboxExecutionPlan,
} from "../../sandbox/src/index";
import { BashTool } from "../../tools/src/bash";

describe("Runtime Sandbox Execution Scope & Plan Binding", () => {
    it("要求模型申请的沙箱能力必须经过 Plan 绑定方可执行", async (t) => {
        if (!isSeatbeltSupported()) {
            t.skip("当前环境不支持 macOS Seatbelt 沙箱");
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), "runtime-scope-"));
        const outsideDir = await mkdtemp(join(tmpdir(), "runtime-outside-"));

        try {
            const rawWorkspace = join(tempRoot, "project");
            await mkdir(rawWorkspace, { recursive: true });
            const workspace = await (await import("node:fs/promises")).realpath(rawWorkspace);

            const externalFile = join(outsideDir, "external.txt");
            await writeFile(externalFile, "external-payload");

            const tool = new BashTool(workspace);

            const testContext = { goalId: "goal-1", runId: "run-1" };

            // 1. 模型提出了文件和网络额外申请，但未绑定核准 plan
            const unapprovedReq = {
                actionId: "action-unapproved",
                context: testContext,
                input: {
                    command: `cat "${externalFile}"`,
                    sandboxAccess: {
                        files: [
                            {
                                path: externalFile,
                                access: "read" as const,
                                kind: "file" as const,
                                purpose: "读取外部文件",
                            },
                        ],
                    },
                },
            };

            const unapprovedRes = await tool.execute(unapprovedReq);
            assert.equal(unapprovedRes.kind, "failure");
            assert.equal(unapprovedRes.code, "SANDBOX_APPROVAL_REQUIRED");

            // 2. 模拟 Runtime/Permission 完成规范化并授予本次执行 plan
            const effectiveScope = await resolveEffectiveSandboxScope(workspace, unapprovedReq.input.sandboxAccess);
            const approvedPlan: SandboxExecutionPlan = {
                workspaceRoot: workspace,
                scope: effectiveScope,
            };

            const approvedReq = {
                actionId: "action-approved",
                context: testContext,
                input: unapprovedReq.input,
                plan: approvedPlan,
            };

            const approvedRes = await tool.execute(approvedReq);
            assert.equal(approvedRes.kind, "success");
            if (approvedRes.kind === "success") {
                assert.equal((approvedRes.output as any).stdout.trim(), "external-payload");
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
            await rm(outsideDir, { recursive: true, force: true });
        }
    });
});
