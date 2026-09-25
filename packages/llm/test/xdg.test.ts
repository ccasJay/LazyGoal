import assert from "node:assert/strict";
import { chmod, mkdir, readFile, symlink, mkdtemp, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    ensureSecureConfigFile,
    ensureSecureHomeDirectories,
    ensureWorkspaceManifest,
    resolveLazyGoalHomePaths,
    resolveWorkspaceHomePaths,
    LazyGoalHomeConfigurationError,
    WorkspaceManifestProtocolError,
} from "../src/xdg";

test("resolveLazyGoalHomePaths 默认使用 HOME/.lazygoal 且忽略 XDG_CONFIG_HOME", () => {
    const fakeHome = "/tmp/lazygoal-home-user";
    const paths = resolveLazyGoalHomePaths({
        HOME: fakeHome,
        XDG_CONFIG_HOME: "/tmp/legacy-xdg",
    });
    assert.equal(paths.homeDirectory, join(fakeHome, ".lazygoal"));
    assert.equal(paths.configFile, join(fakeHome, ".lazygoal", "config.toml"));
    assert.equal(paths.profilesDir, join(fakeHome, ".lazygoal", "profiles"));
    assert.equal(paths.agentProfilesDir, join(fakeHome, ".lazygoal", "agent-profiles"));
});

test("resolveLazyGoalHomePaths 使用绝对 LAZYGOAL_HOME 覆盖默认路径", () => {
    const paths = resolveLazyGoalHomePaths({
        HOME: "/tmp/ignored-home",
        LAZYGOAL_HOME: "/tmp/custom-lazygoal",
        XDG_CONFIG_HOME: "/tmp/ignored-xdg",
    });
    assert.equal(paths.homeDirectory, "/tmp/custom-lazygoal");
});

test("resolveLazyGoalHomePaths 拒绝相对 LAZYGOAL_HOME", () => {
    assert.throws(
        () => resolveLazyGoalHomePaths({ LAZYGOAL_HOME: "relative-home" }),
        (error: unknown) => error instanceof LazyGoalHomeConfigurationError,
    );
});

test("resolveLazyGoalHomePaths 处理空白覆盖并且不创建任何路径", async () => {
    const home = await mkdtemp(join(tmpdir(), "lazygoal-home-test-"));
    const paths = resolveLazyGoalHomePaths({ HOME: home, LAZYGOAL_HOME: "  " });
    assert.equal(paths.homeDirectory, join(home, ".lazygoal"));
    await assert.rejects(stat(paths.homeDirectory));
});

test("ensureSecureHomeDirectories 创建 Home 目录并设置 POSIX 安全权限", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-home-dir-test-"));
    const paths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: join(root, "home") });
    await ensureSecureHomeDirectories(paths);
    assert.ok((await stat(paths.homeDirectory)).isDirectory());
    if (process.platform !== "win32") {
        assert.equal((await stat(paths.homeDirectory)).mode & 0o777, 0o700);
        assert.equal((await stat(paths.agentProfilesDir)).mode & 0o777, 0o700);
    }
});

test("ensureSecureConfigFile 设置 POSIX 敏感文件安全权限", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-home-file-test-"));
    const filePath = join(root, "config.toml");
    await writeFile(filePath, "[llm]\n");
    await chmod(filePath, 0o644);
    await ensureSecureConfigFile(filePath);
    if (process.platform !== "win32") assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});

test("resolveWorkspaceHomePaths 对同一 realpath 生成稳定 workspace ID", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-workspace-test-"));
    const link = join(root, "link");
    await symlink(root, link, "dir");
    const home = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: join(root, "home") });
    const first = await resolveWorkspaceHomePaths(home, root);
    const second = await resolveWorkspaceHomePaths(home, link);
    assert.equal(first.workspaceId, second.workspaceId);
    assert.equal(first.workspaceDirectory, second.workspaceDirectory);
    assert.equal(first.metricsDirectory, join(first.workspaceDirectory, "metrics"));
});

test("resolveWorkspaceHomePaths 为不同 checkout 隔离并在路径移动后生成新 ID", async () => {
    const parent = await mkdtemp(join(tmpdir(), "lazygoal-workspace-identity-test-"));
    const firstRoot = join(parent, "first");
    const secondRoot = join(parent, "second");
    const movedRoot = join(parent, "moved");
    await mkdir(firstRoot);
    await mkdir(secondRoot);
    const home = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: join(parent, "home") });

    const first = await resolveWorkspaceHomePaths(home, firstRoot);
    const second = await resolveWorkspaceHomePaths(home, secondRoot);
    assert.notEqual(first.workspaceId, second.workspaceId);

    await rename(firstRoot, movedRoot);
    const moved = await resolveWorkspaceHomePaths(home, movedRoot);
    assert.notEqual(first.workspaceId, moved.workspaceId);
});

test("ensureWorkspaceManifest 原子创建并拒绝身份不一致", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-manifest-test-"));
    const home = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: join(root, "home") });
    const paths = await resolveWorkspaceHomePaths(home, root);
    await ensureWorkspaceManifest(paths, root);
    const manifest = JSON.parse(await readFile(paths.manifestFile, "utf8")) as { schemaVersion: number; workspaceRoot: string };
    assert.deepEqual(manifest, { schemaVersion: 1, workspaceRoot: root });
    if (process.platform !== "win32") assert.equal((await stat(paths.manifestFile)).mode & 0o777, 0o600);
    await assert.rejects(
        ensureWorkspaceManifest(paths, "/different/workspace"),
        (error: unknown) => error instanceof WorkspaceManifestProtocolError,
    );
});
