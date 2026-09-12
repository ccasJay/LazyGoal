import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createCompositionRoot } from "../src/cli";

test("全新空白工作区凭借全局 XDG 配置成功完成 CompositionRoot 组装", async () => {
    const tempXdg = await mkdtemp(join(tmpdir(), "lazygoal-xdg-root-"));
    const tempWorkspace = await mkdtemp(join(tmpdir(), "lazygoal-empty-workspace-"));

    try {
        const configDir = join(tempXdg, "lazygoal");
        await mkdir(configDir, { recursive: true });

        // 写入 XDG config.toml
        await writeFile(
            join(configDir, "config.toml"),
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
            env: { XDG_CONFIG_HOME: tempXdg, HOME: tempXdg },
        });

        assert.equal(root.profile.id, "default");
        assert.ok(root.profile.toolIds.includes("read_file"));
        const { realpath } = await import("node:fs/promises");
        assert.equal(root.workspaceRoot, await realpath(tempWorkspace));
    } finally {
        await rm(tempXdg, { recursive: true, force: true });
        await rm(tempWorkspace, { recursive: true, force: true });
    }
});

test("bin/lazygoal.cjs 不再包含 --env-file 注入代码", async () => {
    const binScript = join(import.meta.dirname, "../../../bin/lazygoal.cjs");
    const content = await readFile(binScript, "utf-8");
    assert.doesNotMatch(content, /--env-file/);
    assert.doesNotMatch(content, /\.env/);
});
