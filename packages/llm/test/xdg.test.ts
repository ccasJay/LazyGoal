import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolveXdgPaths, ensureSecureConfigDir } from "../src/xdg";

test("resolveXdgPaths 优先使用环境变量 XDG_CONFIG_HOME", () => {
    const customHome = "/custom/xdg/home";
    const paths = resolveXdgPaths({ XDG_CONFIG_HOME: customHome });
    assert.equal(paths.configHome, customHome);
    assert.equal(paths.lazygoalConfigDir, join(customHome, "lazygoal"));
    assert.equal(paths.configFile, join(customHome, "lazygoal", "config.toml"));
    assert.equal(paths.profilesDir, join(customHome, "lazygoal", "profiles"));
});

test("resolveXdgPaths 在未设置 XDG_CONFIG_HOME 时使用 HOME/.config", () => {
    const fakeHome = "/Users/fakeuser";
    const paths = resolveXdgPaths({ HOME: fakeHome, XDG_CONFIG_HOME: undefined });
    assert.equal(paths.configHome, join(fakeHome, ".config"));
    assert.equal(paths.lazygoalConfigDir, join(fakeHome, ".config", "lazygoal"));
    assert.equal(paths.configFile, join(fakeHome, ".config", "lazygoal", "config.toml"));
    assert.equal(paths.profilesDir, join(fakeHome, ".config", "lazygoal", "profiles"));
});

test("resolveXdgPaths 处理 XDG_CONFIG_HOME 为空字符串时正确回退", () => {
    const fakeHome = "/Users/fakeuser";
    const paths = resolveXdgPaths({ HOME: fakeHome, XDG_CONFIG_HOME: "  " });
    assert.equal(paths.configHome, join(fakeHome, ".config"));
});

test("ensureSecureConfigDir 创建目录并设置 POSIX 安全权限 (0700)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-xdg-test-"));
    try {
        const paths = resolveXdgPaths({ XDG_CONFIG_HOME: tempDir });
        await ensureSecureConfigDir(paths);

        const configDirStat = await stat(paths.lazygoalConfigDir);
        assert.ok(configDirStat.isDirectory());

        const profilesDirStat = await stat(paths.profilesDir);
        assert.ok(profilesDirStat.isDirectory());

        if (process.platform !== "win32") {
            const mode = configDirStat.mode & 0o777;
            assert.equal(mode, 0o700);
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("ensureSecureConfigFile 设置 POSIX 敏感文件安全权限 (0600)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-xdg-file-test-"));
    const { writeFile } = await import("node:fs/promises");
    const { ensureSecureConfigFile } = await import("../src/xdg");
    try {
        const filePath = join(tempDir, "config.toml");
        await writeFile(filePath, "api_key = 'secret'\n");
        await ensureSecureConfigFile(filePath);

        const fileStat = await stat(filePath);
        if (process.platform !== "win32") {
            const mode = fileStat.mode & 0o777;
            assert.equal(mode, 0o600);
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
