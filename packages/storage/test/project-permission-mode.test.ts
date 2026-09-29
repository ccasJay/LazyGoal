import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PermissionModeConflictError } from "../../permission/src/index";
import { JsonFileProjectPermissionModeStore } from "../src/index";

test("未持久化时默认返回 Default 模式且 revision 为 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-mode-test-"));
    try {
        const store = new JsonFileProjectPermissionModeStore(dir);
        const current = await store.get("ws-1");

        assert.deepEqual(current, {
            workspaceId: "ws-1",
            mode: "default",
            revision: 0,
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("原子切换模式并递增 revision，重新实例化后依然保持", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-mode-test-"));
    try {
        const store = new JsonFileProjectPermissionModeStore(dir);
        const first = await store.get("ws-1");
        assert.equal(first.mode, "default");
        assert.equal(first.revision, 0);

        // 切换为 yolo
        const updated = await store.set("ws-1", "yolo", 0);
        assert.deepEqual(updated, {
            workspaceId: "ws-1",
            mode: "yolo",
            revision: 1,
        });

        // 重新读取
        const readAgain = await store.get("ws-1");
        assert.deepEqual(readAgain, {
            workspaceId: "ws-1",
            mode: "yolo",
            revision: 1,
        });

        // 模拟重启：创建新 Store 实例读取同一目录
        const restartedStore = new JsonFileProjectPermissionModeStore(dir);
        const restartedRead = await restartedStore.get("ws-1");
        assert.deepEqual(restartedRead, {
            workspaceId: "ws-1",
            mode: "yolo",
            revision: 1,
        });

        // 再次切回 default
        const switchedBack = await restartedStore.set("ws-1", "default", 1);
        assert.deepEqual(switchedBack, {
            workspaceId: "ws-1",
            mode: "default",
            revision: 2,
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("版本不匹配时抛出 PermissionModeConflictError 拒绝写覆盖", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-mode-test-"));
    try {
        const store = new JsonFileProjectPermissionModeStore(dir);
        await store.set("ws-1", "yolo", 0); // revision 变为 1

        // 客户端拿旧 revision: 0 尝试再次设置
        await assert.rejects(
            async () => {
                await store.set("ws-1", "default", 0);
            },
            (error: unknown) => {
                assert.ok(error instanceof PermissionModeConflictError);
                assert.equal(error.workspaceId, "ws-1");
                assert.equal(error.expectedRevision, 0);
                assert.equal(error.actualRevision, 1);
                return true;
            },
        );

        // 验证当前状态未被篡改
        const current = await store.get("ws-1");
        assert.equal(current.mode, "yolo");
        assert.equal(current.revision, 1);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("模式文件损坏时失败关闭，抛出异常，绝不静默覆盖或回退", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perm-mode-test-"));
    try {
        const store = new JsonFileProjectPermissionModeStore(dir);
        const filePath = join(dir, "permission-mode.json");

        // 写入非法 JSON 损坏内容
        await writeFile(filePath, "{ invalid json ...", "utf8");

        await assert.rejects(
            async () => {
                await store.get("ws-1");
            },
            /权限模式文件损坏/,
        );

        await assert.rejects(
            async () => {
                await store.set("ws-1", "yolo", 0);
            },
            /权限模式文件损坏/,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
