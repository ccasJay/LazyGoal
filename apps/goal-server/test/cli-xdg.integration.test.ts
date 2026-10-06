import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createCompositionRoot } from "../src/composition-root";

test("全新空白工作区凭借 LazyGoal Home 配置成功完成 CompositionRoot 组装", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), "lazygoal-home-root-"));
    const tempWorkspace = await mkdtemp(join(tmpdir(), "lazygoal-empty-workspace-"));

    try {
        await mkdir(tempHome, { recursive: true });

        // 写入 LazyGoal Home config.toml
        await writeFile(
            join(tempHome, "config.toml"),
            `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-global-xdg-key"
structured_output_mode = "prompt_only"
`,
        );

        // 干净环境启动：无任何 LLM 环境变量，空工作区内无 .env 与 .lazygoal
        const root = await createCompositionRoot({
            cwd: tempWorkspace,
            env: { LAZYGOAL_HOME: tempHome, HOME: tempHome, XDG_CONFIG_HOME: "/tmp/ignored-xdg" },
        });

        assert.equal(root.profile.id, "default");
        assert.ok(root.profile.toolIds.includes("read_file"));
        if (process.platform !== "win32") {
            assert.equal((await stat(join(tempHome, "config.toml"))).mode & 0o777, 0o600);
        }
        const { realpath } = await import("node:fs/promises");
        assert.equal(root.workspaceRoot, await realpath(tempWorkspace));
    } finally {
        await rm(tempHome, { recursive: true, force: true });
        await rm(tempWorkspace, { recursive: true, force: true });
    }
});

test("bin/lazygoal.cjs 不再包含 --env-file 注入代码", async () => {
    const binScript = join(import.meta.dirname, "../../../bin/lazygoal.cjs");
    const content = await readFile(binScript, "utf-8");
    assert.doesNotMatch(content, /--env-file/);
    assert.doesNotMatch(content, /\.env/);
});
