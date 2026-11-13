import assert from "node:assert/strict";
import { test } from "node:test";

import {
    PermissionProfileConflictError,
    PERMISSION_PRESETS,
    type PermissionProfile,
    type ProjectPermissionProfile,
} from "../../permission/src/index.js";
import type { Goal } from "../../runtime/src/index.js";
import {
    BrowserGoalCommandService,
    type BrowserGoalApiPort,
    type BrowserGoalCoordinator,
    createBrowserGoalRoutes,
} from "../src/index.js";

class StubCoordinator implements BrowserGoalCoordinator {
    async enterPlanMode(): Promise<never> { throw new Error("not implemented"); }
}

function createPort(service: BrowserGoalCommandService): BrowserGoalApiPort {
    return {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async (gid, cmd) => service.enterPlanMode(gid, cmd),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async (gid, cmd) => service.selectModel(gid, cmd),
        getPermissionProfile: () => service.getPermissionProfile(),
        setPermissionProfile: (cmd) => service.setPermissionProfile(cmd),
        listPermissionExemptions: (goalId, runId) => service.listPermissionExemptions(goalId, runId),
        revokePermissionExemption: (goalId, cmd) => service.revokePermissionExemption(goalId, cmd),
    };
}

function createService(coordinator: BrowserGoalCoordinator): BrowserGoalCommandService {
    return new BrowserGoalCommandService({
        store: { restore: async () => undefined },
        coordinator,
    });
}

function postProfile(routes: ReturnType<typeof createBrowserGoalRoutes>, body: unknown): Promise<Response> {
    return Promise.resolve(routes.request("/api/project/permission-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }));
}

test("GET /api/project/permission-profile 返回当前权限档位与修订号", async () => {
    const current: ProjectPermissionProfile = {
        workspaceId: "test-workspace",
        profile: PERMISSION_PRESETS.ask,
        revision: 0,
    };
    const routes = createBrowserGoalRoutes(createPort(createService({
        enterPlanMode: () => { throw new Error("not implemented"); },
        getPermissionProfile: async () => current,
    })));

    const response = await routes.request("/api/project/permission-profile");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        profile: {
            sandbox: "workspace-write",
            approvals: "on-request",
            reviewer: "user",
            writableRoots: [],
        },
        revision: 0,
    });
});

test("POST /api/project/permission-profile 以修订号乐观更新，冲突返回当前档位", async () => {
    let current: ProjectPermissionProfile = {
        workspaceId: "test-workspace",
        profile: PERMISSION_PRESETS.ask,
        revision: 1,
    };
    const routes = createBrowserGoalRoutes(createPort(createService({
        enterPlanMode: () => { throw new Error("not implemented"); },
        getPermissionProfile: async () => current,
        setPermissionProfile: async (profile: PermissionProfile, expectedRevision: number) => {
            if (expectedRevision !== current.revision) {
                throw new PermissionProfileConflictError("test-workspace", expectedRevision, current.revision);
            }
            current = { workspaceId: current.workspaceId, profile, revision: current.revision + 1 };
            return current;
        },
    })));

    const success = await postProfile(routes, { profile: PERMISSION_PRESETS.auto, expectedRevision: 1 });
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), {
        ok: true,
        profile: {
            sandbox: "workspace-write",
            approvals: "on-request",
            reviewer: "auto_review",
            writableRoots: [],
        },
        revision: 2,
    });

    const conflict = await postProfile(routes, { profile: PERMISSION_PRESETS.full, expectedRevision: 1 });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
        ok: false,
        error: "conflict",
        profile: {
            sandbox: "workspace-write",
            approvals: "on-request",
            reviewer: "auto_review",
            writableRoots: [],
        },
        revision: 2,
    });
});

test("POST /api/project/permission-profile 校验非法档位与修订号返回 400", async () => {
    const routes = createBrowserGoalRoutes(createPort(createService(new StubCoordinator())));

    const invalidBodies = [
        {},
        { profile: PERMISSION_PRESETS.ask },
        { profile: { ...PERMISSION_PRESETS.ask, sandbox: "invalid" }, expectedRevision: 0 },
        { profile: { ...PERMISSION_PRESETS.ask, approvals: "always" }, expectedRevision: 0 },
        { profile: { ...PERMISSION_PRESETS.ask, reviewer: "model" }, expectedRevision: 0 },
        { profile: { ...PERMISSION_PRESETS.ask, writableRoots: "outside" }, expectedRevision: 0 },
        { profile: PERMISSION_PRESETS.ask, expectedRevision: -1 },
        { profile: PERMISSION_PRESETS.ask, expectedRevision: "0" },
        { profile: PERMISSION_PRESETS.ask, expectedRevision: 0.5 },
    ];

    for (const body of invalidBodies) {
        const response = await postProfile(routes, body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { error: "invalid_permission_profile_request" });
    }
});

test("权限档位写入只携带档位与修订号，客户端 workspaceId 被剥离", async () => {
    const received: { profile?: PermissionProfile; expectedRevision?: number } = {};
    const routes = createBrowserGoalRoutes(createPort(createService({
        enterPlanMode: () => { throw new Error("not implemented"); },
        setPermissionProfile: async (profile: PermissionProfile, expectedRevision: number) => {
            received.profile = profile;
            received.expectedRevision = expectedRevision;
            return { workspaceId: "server-bound-workspace", profile, revision: expectedRevision + 1 };
        },
    })));

    const response = await postProfile(routes, {
        workspaceId: "client-supplied-workspace",
        profile: PERMISSION_PRESETS.ask,
        expectedRevision: 4,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(received, {
        profile: {
            sandbox: "workspace-write",
            approvals: "on-request",
            reviewer: "user",
            writableRoots: [],
        },
        expectedRevision: 4,
    });
});

test("服务未配置或异常时返回 500 permissions_unavailable", async () => {
    const emptyPort: BrowserGoalApiPort = {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
    };
    const routes = createBrowserGoalRoutes(emptyPort);

    const getRes = await routes.request("/api/project/permission-profile");
    assert.equal(getRes.status, 500);
    assert.deepEqual(await getRes.json(), { error: "permissions_unavailable" });

    const postRes = await postProfile(routes, { profile: PERMISSION_PRESETS.ask, expectedRevision: 0 });
    assert.equal(postRes.status, 500);
    assert.deepEqual(await postRes.json(), { error: "permissions_unavailable" });
});

test("GET /api/goals/:goalId/exemptions 只返回当前 Run 的边界豁免", async () => {
    const goal = { id: "goal-1", state: { run: { id: "run-1" } } } as unknown as Goal;
    const service = new BrowserGoalCommandService({
        store: { restore: async (goalId) => goalId === "goal-1" ? goal : undefined },
        coordinator: {
            enterPlanMode: () => { throw new Error("not implemented"); },
            listPermissionExemptions: async () => [{
                id: "grant-1",
                scope: "goal",
                network: "all_outbound",
                extraFiles: [{ canonicalPath: "/tmp/shared", access: "read", kind: "directory_tree" }],
                status: "active",
            }],
        },
    });
    const routes = createBrowserGoalRoutes(createPort(service));

    const listed = await routes.request("/api/goals/goal-1/exemptions?runId=run-1");
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), {
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        exemptions: [{
            id: "grant-1",
            scope: "goal",
            network: "all_outbound",
            extraFiles: [{ canonicalPath: "/tmp/shared", access: "read", kind: "directory_tree" }],
            status: "active",
        }],
    });

    const stale = await routes.request("/api/goals/goal-1/exemptions?runId=run-2");
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: "stale_run" });
});

test("DELETE /api/goals/:goalId/exemptions/:exemptionId 撤销后返回剩余豁免", async () => {
    const goal = { id: "goal-1", state: { run: { id: "run-1" } } } as unknown as Goal;
    const remaining: string[] = ["grant-1"];
    const service = new BrowserGoalCommandService({
        store: { restore: async (goalId) => goalId === "goal-1" ? goal : undefined },
        coordinator: {
            enterPlanMode: () => { throw new Error("not implemented"); },
            listPermissionExemptions: async () => remaining.map((id) => ({
                id,
                scope: "workspace" as const,
                network: "none" as const,
                extraFiles: [],
                status: "active" as const,
            })),
            revokePermissionExemption: async ({ exemptionId }) => {
                const index = remaining.indexOf(exemptionId);
                if (index >= 0) remaining.splice(index, 1);
            },
        },
    });
    const routes = createBrowserGoalRoutes(createPort(service));

    const revoked = await routes.request("/api/goals/goal-1/exemptions/grant-1", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1" }),
    });
    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), { ok: true, goalId: "goal-1", runId: "run-1", exemptions: [] });

    const invalid = await routes.request("/api/goals/goal-1/exemptions/grant-1", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_exemption_request" });
});
