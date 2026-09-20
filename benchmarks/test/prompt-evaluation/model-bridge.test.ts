import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

import { runGepaResolveModelsCli } from "../../src/prompt-evaluation/model-bridge.js";

async function setupConfig(t: TestContext): Promise<{ env: NodeJS.ProcessEnv }> {
    const root = await mkdtemp(join(tmpdir(), "gepa-model-bridge-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const lazygoal = join(root, "lazygoal");
    const profiles = join(lazygoal, "profiles");
    await mkdir(profiles, { recursive: true });
    await writeFile(join(lazygoal, "config.toml"), "[gepa]\nreflection_profile = \"reflection\"\n");
    await writeFile(join(profiles, "default.toml"), "[llm]\nprovider = \"openai\"\nmodel = \"working-model\"\napi_key = \"sk-working-secret\"\n");
    await writeFile(join(profiles, "reflection.toml"), "[llm]\nprovider = \"deepseek\"\nmodel = \"reflection-model\"\napi_key = \"sk-reflection-secret\"\n");
    return { env: { XDG_CONFIG_HOME: root } };
}

test("resolve-models 只输出双模型无凭据身份且 stdout 恰好一行", async (t) => {
    const { env } = await setupConfig(t);
    const output: string[] = [];
    const errors: string[] = [];
    const code = await runGepaResolveModelsCli(["gepa", "resolve-models"], {
        env,
        writeOutput: (line) => output.push(line),
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 0);
    assert.equal(output.length, 1);
    assert.equal(errors.length, 0);
    assert.deepEqual(JSON.parse(output[0]!), {
        working: { profileName: "default", provider: "openai", modelId: "working-model" },
        reflection: { profileName: "reflection", provider: "deepseek", modelId: "reflection-model" },
    });
    assert.ok(!output[0]!.includes("secret"));
    assert.ok(!output[0]!.includes("apiKey"));
});

test("resolve-models 失败时 stdout 为空，stderr 为单行且脱敏有界 JSON", async (t) => {
    const { env } = await setupConfig(t);
    await writeFile(join(env.XDG_CONFIG_HOME!, "lazygoal", "config.toml"), "[gepa]\nreflection_profile = \"missing\"\n");
    const output: string[] = [];
    const errors: string[] = [];
    const code = await runGepaResolveModelsCli(["gepa", "resolve-models"], {
        env: { ...env, OPENAI_API_KEY: "sk-resolve-secret" },
        writeOutput: (line) => output.push(line),
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 2);
    assert.equal(output.length, 0);
    assert.equal(errors.length, 1);
    assert.ok(errors[0]!.length <= 4_200);
    assert.ok(!errors[0]!.includes("sk-resolve-secret"));
    assert.equal(JSON.parse(errors[0]!).error, "invalid_request");
});

test("bin/lazygoal.cjs 将 resolve-models 路由到 TS bridge 而非 Python 生命周期", async (t) => {
    const { env } = await setupConfig(t);
    const result = execFileSync(process.execPath, [
        resolve("bin/lazygoal.cjs"),
        "gepa",
        "resolve-models",
    ], {
        env: { ...process.env, ...env },
        encoding: "utf8",
    });
    const lines = result.trimEnd().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]!), {
        working: { profileName: "default", provider: "openai", modelId: "working-model" },
        reflection: { profileName: "reflection", provider: "deepseek", modelId: "reflection-model" },
    });
});
