import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    DEFAULT_PERMISSION_PROFILE,
    PermissionProfileConflictError,
    PERMISSION_PRESETS,
    type PermissionProfile,
} from "../../permission/src/index";
import { JsonFileProjectPermissionProfileStore } from "../src/json-file-project-permission-profile-store";

const WRITABLE_ROOTS_PROFILE: PermissionProfile = {
    sandbox: "workspace-write",
    approvals: "on-request",
    reviewer: "user",
    writableRoots: ["/Users/me/shared", "/tmp/lg-shared"],
};

test("未持久化时返回默认档位且 revision 为 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const store = new JsonFileProjectPermissionProfileStore(dir);
        const current = await store.get("ws-1");

        assert.deepEqual(current, {
            workspaceId: "ws-1",
            profile: DEFAULT_PERMISSION_PROFILE,
            revision: 0,
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("写入档位后递增 revision，重新实例化仍保持", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const store = new JsonFileProjectPermissionProfileStore(dir);
        const first = await store.get("ws-1");
        assert.equal(first.revision, 0);

        const updated = await store.update("ws-1", PERMISSION_PRESETS.auto, 0);
        assert.deepEqual(updated, {
            workspaceId: "ws-1",
            profile: PERMISSION_PRESETS.auto,
            revision: 1,
        });

        const restarted = new JsonFileProjectPermissionProfileStore(dir);
        assert.deepEqual(await restarted.get("ws-1"), updated);

        const switched = await restarted.update("ws-1", PERMISSION_PRESETS.full, 1);
        assert.deepEqual(switched, {
            workspaceId: "ws-1",
            profile: PERMISSION_PRESETS.full,
            revision: 2,
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("修订号不匹配时抛出 PermissionProfileConflictError 且不覆盖既有值", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const store = new JsonFileProjectPermissionProfileStore(dir);
        await store.update("ws-1", PERMISSION_PRESETS.auto, 0);

        await assert.rejects(
            async () => {
                await store.update("ws-1", PERMISSION_PRESETS.ask, 0);
            },
            (error: unknown) => {
                assert.ok(error instanceof PermissionProfileConflictError);
                assert.equal(error.workspaceId, "ws-1");
                assert.equal(error.expectedRevision, 0);
                assert.equal(error.actualRevision, 1);
                return true;
            },
        );

        const current = await store.get("ws-1");
        assert.deepEqual(current, {
            workspaceId: "ws-1",
            profile: PERMISSION_PRESETS.auto,
            revision: 1,
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("记录属于其它工作区时按默认档位读取", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const store = new JsonFileProjectPermissionProfileStore(dir);
        await store.update("ws-1", PERMISSION_PRESETS.auto, 0);

        assert.deepEqual(await store.get("ws-2"), {
            workspaceId: "ws-2",
            profile: DEFAULT_PERMISSION_PROFILE,
            revision: 0,
        });

        const overwritten = await store.update("ws-2", PERMISSION_PRESETS.ask, 0);
        assert.deepEqual(overwritten, {
            workspaceId: "ws-2",
            profile: PERMISSION_PRESETS.ask,
            revision: 1,
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("档位文件损坏时读取与写入都失败关闭", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const store = new JsonFileProjectPermissionProfileStore(dir);
        const filePath = join(dir, "permission-profile.json");

        await writeFile(filePath, "{ invalid json ...", "utf8");

        await assert.rejects(async () => store.get("ws-1"), /invalid JSON/);
        await assert.rejects(
            async () => store.update("ws-1", PERMISSION_PRESETS.auto, 0),
            /invalid JSON/,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("档位文件含未知字段或不受支持的版本时拒绝读取", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const filePath = join(dir, "permission-profile.json");
        const stored = {
            version: 1,
            workspaceId: "ws-1",
            sandbox: "workspace-write",
            approvals: "on-request",
            reviewer: "user",
            writableRoots: [],
            revision: 1,
        };

        await writeFile(filePath, JSON.stringify({ ...stored, extra: true }), "utf8");
        const store = new JsonFileProjectPermissionProfileStore(dir);
        await assert.rejects(async () => store.get("ws-1"), /structurally invalid/);

        await writeFile(filePath, JSON.stringify({ ...stored, version: 2 }), "utf8");
        const restarted = new JsonFileProjectPermissionProfileStore(dir);
        await assert.rejects(async () => restarted.get("ws-1"), /structurally invalid/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("writableRoots 原样往返", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    try {
        const store = new JsonFileProjectPermissionProfileStore(dir);
        const written = await store.update("ws-1", WRITABLE_ROOTS_PROFILE, 0);
        assert.deepEqual(written.profile.writableRoots, WRITABLE_ROOTS_PROFILE.writableRoots);

        const restarted = new JsonFileProjectPermissionProfileStore(dir);
        const restored = await restarted.get("ws-1");
        assert.deepEqual(restored.profile, WRITABLE_ROOTS_PROFILE);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("permission-profile.json 不受进程 umask 影响，创建时为 0600", async () => {
    const parent = await mkdtemp(join(tmpdir(), "perm-profile-test-"));
    const directory = join(parent, "nested");
    const previousUmask = process.umask(0);
    try {
        const store = new JsonFileProjectPermissionProfileStore(directory);
        await store.update("ws-1", PERMISSION_PRESETS.auto, 0);
        assert.equal((await stat(directory)).mode & 0o777, 0o700);
        assert.equal((await stat(join(directory, "permission-profile.json"))).mode & 0o777, 0o600);
    } finally {
        process.umask(previousUmask);
        await rm(parent, { recursive: true, force: true });
    }
});
