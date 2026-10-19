import assert from "node:assert/strict";
import { test } from "node:test";

import {
    PermissionModeConflictError,
    type ProjectPermissionMode,
} from "../../permission/src/index.js";
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
        list: async () => [],
        read: async () => undefined,
        enterPlanMode: async (gid, cmd) => service.enterPlanMode(gid, cmd),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async (gid, cmd) => service.selectModel(gid, cmd),
        getPermissionMode: () => service.getPermissionMode(),
        setPermissionMode: (cmd) => service.setPermissionMode(cmd),
    };
}

test("GET /api/project/permission-mode 返回当前项目权限模式", async () => {
    let currentMode: ProjectPermissionMode = {
        workspaceId: "test-workspace",
        mode: "default",
        revision: 0,
    };

    const coordinator: BrowserGoalCoordinator = {
        enterPlanMode: () => { throw new Error("not implemented"); },
        getPermissionMode: async () => currentMode,
    };

    const service = new BrowserGoalCommandService({
        store: { restore: async () => undefined },
        coordinator,
    });

    const routes = createBrowserGoalRoutes(createPort(service));
    const response = await routes.request("/api/project/permission-mode");

    assert.equal(response.status, 200);
    const data = await response.json() as Record<string, unknown>;
    assert.deepEqual(data, {
        ok: true,
        mode: "default",
        revision: 0,
        workspaceId: "test-workspace",
    });
});

test("POST /api/project/permission-mode 成功切换模式，冲突时返回 409", async () => {
    let currentMode: ProjectPermissionMode = {
        workspaceId: "test-workspace",
        mode: "default",
        revision: 1,
    };

    const coordinator: BrowserGoalCoordinator = {
        enterPlanMode: () => { throw new Error("not implemented"); },
        getPermissionMode: async () => currentMode,
        setPermissionMode: async (mode, expectedRevision) => {
            if (expectedRevision !== currentMode.revision) {
                throw new PermissionModeConflictError(
                    "test-workspace",
                    expectedRevision,
                    currentMode.revision,
                );
            }
            currentMode = {
                workspaceId: currentMode.workspaceId,
                mode,
                revision: currentMode.revision + 1,
            };
            return currentMode;
        },
    };

    const service = new BrowserGoalCommandService({
        store: { restore: async () => undefined },
        coordinator,
    });

    const routes = createBrowserGoalRoutes(createPort(service));

    // 1. 成功从 revision 1 切换到 yolo
    const successRes = await routes.request("/api/project/permission-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "yolo", expectedRevision: 1 }),
    });
    assert.equal(successRes.status, 200);
    const successData = await successRes.json() as Record<string, unknown>;
    assert.deepEqual(successData, {
        ok: true,
        mode: "yolo",
        revision: 2,
        workspaceId: "test-workspace",
    });

    // 2. 携带陈旧的 revision (1) 再次提交，发生冲突 409
    const conflictRes = await routes.request("/api/project/permission-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "default", expectedRevision: 1 }),
    });
    assert.equal(conflictRes.status, 409);
    const conflictData = await conflictRes.json() as Record<string, unknown>;
    assert.deepEqual(conflictData, {
        ok: false,
        error: "conflict",
        actualRevision: 2,
    });
});

test("POST /api/project/permission-mode 校验非法输入返回 400", async () => {
    const service = new BrowserGoalCommandService({
        store: { restore: async () => undefined },
        coordinator: new StubCoordinator(),
    });

    const routes = createBrowserGoalRoutes(createPort(service));

    const invalidBodies = [
        {},
        { mode: "invalid", expectedRevision: 0 },
        { mode: "yolo", expectedRevision: -1 },
        { mode: "yolo", expectedRevision: "0" },
        { mode: "default", expectedRevision: 0, extraField: true },
    ];

    for (const body of invalidBodies) {
        const response = await routes.request("/api/project/permission-mode", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
        const data = await response.json() as Record<string, unknown>;
        assert.equal(data.error, "invalid_permission_mode_request");
    }
});

test("服务未配置或异常时返回 500 permissions_unavailable 且无敏感泄露", async () => {
    const emptyPort: BrowserGoalApiPort = {
        list: async () => [],
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
    };

    const routes = createBrowserGoalRoutes(emptyPort);

    const getRes = await routes.request("/api/project/permission-mode");
    assert.equal(getRes.status, 500);
    assert.deepEqual(await getRes.json(), { error: "permissions_unavailable" });

    const postRes = await routes.request("/api/project/permission-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "yolo", expectedRevision: 0 }),
    });
    assert.equal(postRes.status, 500);
    assert.deepEqual(await postRes.json(), { error: "permissions_unavailable" });
});
