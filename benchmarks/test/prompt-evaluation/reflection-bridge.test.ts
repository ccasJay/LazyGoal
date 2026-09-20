import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm/src/core/adapter.js";
import {
    runGepaReflectCli,
    parseAndValidateReflectRequest,
    redactSensitiveString,
    GEPA_REFLECTION_OUTPUT_MAX_CHARS,
} from "../../src/prompt-evaluation/reflection-bridge.js";

class MockReflectionLLMAdapter implements LLMAdapter {
    readonly structuredOutputMode = "prompt_only" as const;
    public readonly receivedRequests: LLMRequest[] = [];

    constructor(
        private readonly implementation: (req: LLMRequest) => Promise<LLMResponse> = async () => ({
            content: "Reflected mutation candidate\nwith newline",
            providerMetadata: { usage: { inputTokens: 120, outputTokens: 80 } },
        }),
    ) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.receivedRequests.push(request);
        return this.implementation(request);
    }
}

async function createTempDir(t: TestContext, prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    t.after(() => rm(dir, { recursive: true, force: true }));
    return dir;
}

test("redactSensitiveString 脱敏环境变量密钥与 sk 密钥", () => {
    const env = {
        OPENAI_API_KEY: "secret-key-12345",
        CUSTOM_SECRET: "my-custom-token-999",
        NORMAL_VAR: "regular-value",
    };
    const input = "Error calling API with secret-key-12345 and my-custom-token-999 and sk-abcdef1234567890123456";
    const redacted = redactSensitiveString(input, env);
    assert.ok(!redacted.includes("secret-key-12345"));
    assert.ok(!redacted.includes("my-custom-token-999"));
    assert.ok(!redacted.includes("sk-abcdef1234567890123456"));
    assert.ok(redacted.includes("[REDACTED]"));
});

test("parseAndValidateReflectRequest 正常归一化纯文本字符串 Prompt", () => {
    const json = JSON.stringify({
        model: { configId: "reflection" },
        prompt: "Reflect on this trace",
    });
    const parsed = parseAndValidateReflectRequest(json);
    assert.deepEqual(parsed.messages, [{ role: "user", content: "Reflect on this trace" }]);
    assert.equal(parsed.model?.configId, "reflection");
});

test("parseAndValidateReflectRequest 正常保留合法消息数组 Prompt", () => {
    const json = JSON.stringify({
        prompt: [
            { role: "system", content: "System prompt" },
            { role: "user", content: "User prompt" },
            { role: "assistant", content: "Assistant reply" },
        ],
    });
    const parsed = parseAndValidateReflectRequest(json);
    assert.equal(parsed.messages.length, 3);
    assert.equal(parsed.messages[0]!.role, "system");
    assert.equal(parsed.messages[1]!.role, "user");
    assert.equal(parsed.messages[2]!.role, "assistant");
});

test("parseAndValidateReflectRequest 拒绝非法角色（如 tool, function）", () => {
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({
            prompt: [{ role: "tool", content: "tool output" }],
        })),
        (err: unknown) => {
            assert.match((err as Error).message, /Invalid message role: "tool"/);
            return true;
        },
    );

    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({
            prompt: [{ role: "function", content: "function output" }],
        })),
        (err: unknown) => {
            assert.match((err as Error).message, /Invalid message role: "function"/);
            return true;
        },
    );
});

test("parseAndValidateReflectRequest 拒绝空 Prompt 与非纯文本 content", () => {
    // 空字符串
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({ prompt: "   " })),
        (err: unknown) => {
            assert.match((err as Error).message, /Prompt cannot be empty/);
            return true;
        },
    );

    // 空数组
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({ prompt: [] })),
        (err: unknown) => {
            assert.match((err as Error).message, /Prompt messages array cannot be empty/);
            return true;
        },
    );

    // content 为对象
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({
            prompt: [{ role: "user", content: { type: "text" } }],
        })),
        (err: unknown) => {
            assert.match((err as Error).message, /Message content at index 0 must be a string/);
            return true;
        },
    );
});

test("parseAndValidateReflectRequest 拒绝包含未知顶级字段的请求", () => {
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({
            prompt: "valid prompt",
            unknownField: "forbidden",
        })),
        (err: unknown) => {
            assert.match((err as Error).message, /Unknown field in request: "unknownField"/);
            return true;
        },
    );
});

test("runGepaReflectCli 缺少 --request 参数时返回退出码 2 并输出结构化错误", async () => {
    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect"], {
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });
    assert.equal(code, 2);
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!);
    assert.equal(parsed.error, "invalid_request");
    assert.match(parsed.message, /Missing --request argument/);
});

test("runGepaReflectCli 请求文件不存在时返回退出码 2 并输出结构化错误", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-test-");
    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", "nonexistent.json"], {
        cwd: tempDir,
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });
    assert.equal(code, 2);
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!);
    assert.equal(parsed.error, "invalid_request");
    assert.match(parsed.message, /Request file not found/);
});

test("runGepaReflectCli 请求文件损坏时返回退出码 2 并输出结构化错误", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-test-");
    const reqFile = join(tempDir, "bad-request.json");
    await writeFile(reqFile, "{ invalid json content");

    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", "bad-request.json"], {
        cwd: tempDir,
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });
    assert.equal(code, 2);
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!);
    assert.equal(parsed.error, "invalid_request");
    assert.match(parsed.message, /syntax error/);
});

test("runGepaReflectCli 成功执行纯文本无工具生成并返回 stdout 单行 JSON", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-test-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({
        model: { configId: "reflection" },
        prompt: "Mutate system prompt to avoid loop",
    }));

    const mockAdapter = new MockReflectionLLMAdapter();
    const outputs: string[] = [];
    const errors: string[] = [];

    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: mockAdapter,
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 0);
    assert.equal(errors.length, 0);
    assert.equal(outputs.length, 1, "stdout 必须输出且仅输出一行单行 JSON");

    // 验证请求契约：强制无 tools 且 toolChoice 为 none
    assert.equal(mockAdapter.receivedRequests.length, 1);
    const sentRequest = mockAdapter.receivedRequests[0]!;
    assert.equal(sentRequest.toolChoice, "none");
    assert.equal(sentRequest.tools, undefined);
    assert.equal(sentRequest.structuredOutput, undefined);
    assert.deepEqual(sentRequest.messages, [
        { role: "user", content: "Mutate system prompt to avoid loop" },
    ]);

    // 验证单行 JSON 解析
    const parsedOutput = JSON.parse(outputs[0]!);
    assert.equal(parsedOutput.text, "Reflected mutation candidate\nwith newline");
    assert.deepEqual(parsedOutput.usage, { inputTokens: 120, outputTokens: 80 });
});

test("runGepaReflectCli 拒绝与实际 Reflection Profile 不一致的 configId", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-config-id-");
    const xdgConfigHome = join(tempDir, ".config");
    const profilesDir = join(xdgConfigHome, "lazygoal/profiles");
    await mkdir(profilesDir, { recursive: true });
    await writeFile(join(xdgConfigHome, "lazygoal/config.toml"), "[gepa]\nreflection_profile = \"reflection\"\n");
    await writeFile(join(profilesDir, "reflection.toml"), "[llm]\nprovider = \"openai\"\nmodel = \"reflection-model\"\napi_key = \"sk-reflection\"\n");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ model: { configId: "wrong-profile" }, prompt: "Reflect" }));
    const errors: string[] = [];
    let called = false;
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        env: { XDG_CONFIG_HOME: xdgConfigHome },
        reflectionAdapter: {
            structuredOutputMode: "prompt_only",
            async generate() {
                called = true;
                return { content: "should not run" };
            },
        },
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });
    assert.equal(code, 2);
    assert.equal(called, false);
    assert.match(JSON.parse(errors[0]!).message, /must match configured profile "reflection"/);
});

test("runGepaReflectCli 对模型输出和诊断设置明确上限", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-output-limit-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect" }));
    const output: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: {
            structuredOutputMode: "prompt_only",
            async generate() {
                return { content: "x".repeat(GEPA_REFLECTION_OUTPUT_MAX_CHARS + 100) };
            },
        },
        writeOutput: (line) => output.push(line),
        writeError: assert.fail,
    });
    assert.equal(code, 0);
    assert.equal(JSON.parse(output[0]!).text.length, GEPA_REFLECTION_OUTPUT_MAX_CHARS);
});

test("runGepaReflectCli 在 Reflection LM 异常时输出 model_error 且严禁回退", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-test-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({
        prompt: "Trigger provider error",
    }));

    const failingAdapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() {
            throw new Error("Provider authentication failed with sk-live-secret-key-12345");
        },
    };

    const outputs: string[] = [];
    const errors: string[] = [];

    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: failingAdapter,
        env: { LLM_KEY: "sk-live-secret-key-12345" },
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 1);
    assert.equal(outputs.length, 0);
    assert.equal(errors.length, 1);

    const parsedError = JSON.parse(errors[0]!);
    assert.equal(parsedError.error, "model_error");
    // 敏感密钥必须脱敏
    assert.ok(!parsedError.message.includes("sk-live-secret-key-12345"));
    assert.ok(parsedError.message.includes("[REDACTED]"));
});

test("runGepaReflectCli 在生产环境下按 XDG Profile 解析 Reflection LM 并执行", async (t) => {
    const tempDir = await createTempDir(t, "gepa-reflect-xdg-");
    const xdgConfigHome = join(tempDir, ".config");
    const profilesDir = join(xdgConfigHome, "lazygoal/profiles");
    await mkdir(profilesDir, { recursive: true });

    // 主配置：[gepa].reflection_profile = "reflection"
    await writeFile(join(xdgConfigHome, "lazygoal/config.toml"), `
[gepa]
reflection_profile = "reflection"
`);

    // Working Profile（若被加载就会暴露出错误 model）
    await writeFile(join(profilesDir, "default.toml"), `
[llm]
provider = "openai"
model = "gpt-4o-working"
api_key = "sk-working-key"
`);

    // Reflection Profile
    await writeFile(join(profilesDir, "reflection.toml"), `
[llm]
provider = "openai"
model = "gpt-4o-reflection"
api_key = "sk-reflection-key"
`);

    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({
        prompt: "Reflect test prompt",
    }));

    let interceptedRequestModel: string | undefined;
    const trackingAdapter = new MockReflectionLLMAdapter(async (req) => {
        return {
            content: "Mock reflection response",
            providerMetadata: { usage: { inputTokens: 10, outputTokens: 5 } },
        };
    });

    const outputs: string[] = [];
    const errors: string[] = [];

    // 不传 reflectionAdapter，验证 loadReflectionRuntimeConfig 加载的是 reflection.toml
    // 我们可以验证 loadReflectionRuntimeConfig 在该环境下正常加载出 reflection profile
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        env: { XDG_CONFIG_HOME: xdgConfigHome },
        reflectionAdapter: trackingAdapter, // 这里传 adapter 拦截调用
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 0);
    assert.equal(outputs.length, 1);
});

test("bin/lazygoal.cjs 顶层命令正确分发 gepa reflect", async (t) => {
    const tempDir = await createTempDir(t, "gepa-cli-dispatch-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, "{ bad json");

    const rootDir = resolve(".");
    const binScript = join(rootDir, "bin/lazygoal.cjs");

    try {
        execFileSync(process.execPath, [binScript, "gepa", "reflect", "--request", reqFile], {
            cwd: tempDir,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        assert.fail("应当因 JSON 非法以退出码 2 退出");
    } catch (err: unknown) {
        const error = err as { status?: number; stderr?: string };
        assert.equal(error.status, 2, "退出码应为 2 (invalid_request)");
        const parsed = JSON.parse((error.stderr ?? "").trim());
        assert.equal(parsed.error, "invalid_request");
    }
});

test("runGepaReflectCli 在 XDG Reflection Profile 缺失时报错退出码 2", async (t) => {
    const tempDir = await createTempDir(t, "gepa-missing-prof-");
    const xdgConfigHome = join(tempDir, ".config");
    const profilesDir = join(xdgConfigHome, "lazygoal/profiles");
    await mkdir(profilesDir, { recursive: true });

    await writeFile(join(xdgConfigHome, "lazygoal/config.toml"), `
[gepa]
reflection_profile = "missing-prof"
`);
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect" }));

    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        env: { XDG_CONFIG_HOME: xdgConfigHome },
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 2);
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!);
    assert.equal(parsed.error, "invalid_request");
    assert.match(parsed.message, /Profile "missing-prof" 不存在/);
});

test("runGepaReflectCli 在配置 reflection_profile 为 default 时快速失败退出码 2", async (t) => {
    const tempDir = await createTempDir(t, "gepa-conflict-prof-");
    const xdgConfigHome = join(tempDir, ".config");
    await mkdir(join(xdgConfigHome, "lazygoal/profiles"), { recursive: true });

    await writeFile(join(xdgConfigHome, "lazygoal/config.toml"), `
[gepa]
reflection_profile = "default"
`);
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect" }));

    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        env: { XDG_CONFIG_HOME: xdgConfigHome },
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 2);
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!);
    assert.equal(parsed.error, "invalid_request");
    assert.match(parsed.message, /不能与 Working Profile 同名/);
});

test("runGepaReflectCli 请求 Payload 超限快速失败退出码 2", async (t) => {
    const tempDir = await createTempDir(t, "gepa-payload-limit-");
    const reqFile = join(tempDir, "huge-request.json");
    // 生成超过 2MB 的巨大文件
    const hugePrompt = "x".repeat(2 * 1024 * 1024 + 100);
    await writeFile(reqFile, JSON.stringify({ prompt: hugePrompt }));

    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 2);
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!);
    assert.equal(parsed.error, "invalid_request");
    assert.match(parsed.message, /Payload too large/);
});

test("runGepaReflectCli 处理已中止信号返回 130", async (t) => {
    const tempDir = await createTempDir(t, "gepa-abort-test-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect" }));

    const controller = new AbortController();
    controller.abort();

    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        signal: controller.signal,
        reflectionAdapter: new MockReflectionLLMAdapter(),
        writeOutput: assert.fail,
        writeError: assert.fail,
    });

    assert.equal(code, 130);
});

test("runGepaReflectCli 成功对 stdout 输出中模型复述的敏感密钥与环境变量执行脱敏", async (t) => {
    const tempDir = await createTempDir(t, "gepa-stdout-redact-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect trace" }));

    const mockAdapter = new MockReflectionLLMAdapter(async () => ({
        content: "Reflected text with sk-1234567890abcdef and Bearer secret-token-xyz and my-env-secret-value",
        providerMetadata: { usage: { inputTokens: 50, outputTokens: 25 } },
    }));

    const outputs: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: mockAdapter,
        env: {
            CUSTOM_SECRET: "my-env-secret-value",
        },
        writeOutput: (line) => outputs.push(line),
        writeError: assert.fail,
    });

    assert.equal(code, 0);
    assert.equal(outputs.length, 1);
    const parsed = JSON.parse(outputs[0]!);
    assert.ok(!parsed.text.includes("sk-1234567890abcdef"));
    assert.ok(!parsed.text.includes("secret-token-xyz"));
    assert.ok(!parsed.text.includes("my-env-secret-value"));
    assert.equal(parsed.text, "Reflected text with [REDACTED] and Bearer [REDACTED] and [REDACTED]");
});
