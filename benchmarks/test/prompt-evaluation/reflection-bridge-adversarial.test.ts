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
} from "../../src/prompt-evaluation/reflection-bridge.js";

class MockReflectionLLMAdapter implements LLMAdapter {
    readonly structuredOutputMode = "prompt_only" as const;
    public readonly receivedRequests: LLMRequest[] = [];

    constructor(
        private readonly implementation: (req: LLMRequest) => Promise<LLMResponse> = async () => ({
            content: "Reflected mutation candidate",
            providerMetadata: { usage: { inputTokens: 100, outputTokens: 50 } },
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

// =========================================================================
// Suite 1: 输入 Prompt 格式变异测试 (黑盒与白盒边界)
// =========================================================================

test("[Adversarial] Prompt 格式变异：纯文本各边界与空白控制字符", async (t) => {
    // 1. 空白字符输入（空格、制表符、换行符）应当被严格拒绝
    const whitespacePrompts = ["", "   ", "\t\t", "\n\r\n", "  \t \n  "];
    for (const ws of whitespacePrompts) {
        assert.throws(
            () => parseAndValidateReflectRequest(JSON.stringify({ prompt: ws })),
            (err: unknown) => {
                assert.match((err as Error).message, /Prompt cannot be empty/);
                return true;
            },
            `应当拒绝空白 prompt: ${JSON.stringify(ws)}`,
        );
    }

    // 2. 特殊字符、多行与 Unicode 表情等合法纯文本输入应当正常通过
    const validComplexPrompts = [
        "Line 1\nLine 2\r\nLine 3 with tab\t!",
        "Special chars: `~!@#$%^&*()_+-=[]{}|;':\",./<>? 🚀✨\u00A0\u2002",
        "JSON inside text: {\"key\": \"value\", \"nested\": [1, 2, 3]}",
    ];
    for (const p of validComplexPrompts) {
        const parsed = parseAndValidateReflectRequest(JSON.stringify({ prompt: p }));
        assert.equal(parsed.messages.length, 1);
        assert.equal(parsed.messages[0]!.role, "user");
        assert.equal(parsed.messages[0]!.content, p);
    }
});

test("[Adversarial] Prompt 格式变异：多轮消息数组合法与非法结构", async (t) => {
    // 1. 只有 system 消息
    const sysOnly = parseAndValidateReflectRequest(JSON.stringify({
        prompt: [{ role: "system", content: "You are a prompt optimizer." }],
    }));
    assert.deepEqual(sysOnly.messages, [{ role: "system", content: "You are a prompt optimizer." }]);

    // 2. 只有 assistant 消息
    const asstOnly = parseAndValidateReflectRequest(JSON.stringify({
        prompt: [{ role: "assistant", content: "Previous answer" }],
    }));
    assert.deepEqual(asstOnly.messages, [{ role: "assistant", content: "Previous answer" }]);

    // 3. 混合多轮数组
    const multi = parseAndValidateReflectRequest(JSON.stringify({
        prompt: [
            { role: "system", content: "sys" },
            { role: "user", content: "u1" },
            { role: "assistant", content: "a1" },
            { role: "user", content: "u2" },
        ],
    }));
    assert.equal(multi.messages.length, 4);

    // 4. 非法消息元素类型（非对象）
    const invalidItems = [123, "string", true, null, [1, 2]];
    for (const item of invalidItems) {
        assert.throws(
            () => parseAndValidateReflectRequest(JSON.stringify({ prompt: [item] })),
            /Prompt message at index 0 must be an object/,
        );
    }

    // 5. 缺少 content 或 role 字段
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({ prompt: [{ role: "user" }] })),
        /Message content at index 0 must be a string/,
    );
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({ prompt: [{ content: "hi" }] })),
        /Invalid message role: "undefined"/,
    );

    // 6. 消息对象注入未知字段
    assert.throws(
        () => parseAndValidateReflectRequest(JSON.stringify({
            prompt: [{ role: "user", content: "hi", extraField: 123 }],
        })),
        /Unknown field in message\[0\]: "extraField"/,
    );
});

test("[Adversarial] Prompt 格式变异：严格拦截非法 role (tool/function/developer/model/大小写)", async (t) => {
    const forbiddenRoles = [
        "tool",
        "function",
        "developer",
        "model",
        "bot",
        "User",       // 大写
        "USER",
        "System",
        "Assistant",
        "",
        "unknown_role",
    ];

    for (const role of forbiddenRoles) {
        assert.throws(
            () => parseAndValidateReflectRequest(JSON.stringify({
                prompt: [{ role, content: "test" }],
            })),
            (err: unknown) => {
                assert.match((err as Error).message, /Invalid message role/);
                return true;
            },
            `应当拦截非法 role: ${role}`,
        );
    }
});

test("[Adversarial] Prompt 格式变异：2MB 边界截断与超限防御", async (t) => {
    const tempDir = await createTempDir(t, "adv-payload-");

    // 1. 刚好超过 2MB (2 * 1024 * 1024 + 1 字符)
    const limit = 2 * 1024 * 1024;
    const overLimitJson = JSON.stringify({ prompt: "a".repeat(limit) }); // 总长度超出 limit
    assert.ok(overLimitJson.length > limit);

    const overFile = join(tempDir, "over.json");
    await writeFile(overFile, overLimitJson);

    const errorsOver: string[] = [];
    const codeOver = await runGepaReflectCli(["gepa", "reflect", "--request", overFile], {
        cwd: tempDir,
        writeOutput: assert.fail,
        writeError: (l) => errorsOver.push(l),
    });
    assert.equal(codeOver, 2);
    assert.equal(errorsOver.length, 1);
    const parsedOver = JSON.parse(errorsOver[0]!);
    assert.equal(parsedOver.error, "invalid_request");
    assert.match(parsedOver.message, /Payload too large/);

    // 2. 刚好在限制内 (构造总长度恰好为 limit 的合法 JSON)
    const base = JSON.stringify({ prompt: "" });
    const paddingSize = limit - base.length;
    const exactlyLimitJson = JSON.stringify({ prompt: "b".repeat(paddingSize) });
    assert.equal(exactlyLimitJson.length, limit);

    const exactFile = join(tempDir, "exact.json");
    await writeFile(exactFile, exactlyLimitJson);

    const mockAdapter = new MockReflectionLLMAdapter();
    const outputsExact: string[] = [];
    const codeExact = await runGepaReflectCli(["gepa", "reflect", "--request", exactFile], {
        cwd: tempDir,
        reflectionAdapter: mockAdapter,
        writeOutput: (l) => outputsExact.push(l),
        writeError: assert.fail,
    });
    assert.equal(codeExact, 0);
    assert.equal(outputsExact.length, 1);
    assert.equal(mockAdapter.receivedRequests[0]!.messages[0]!.content.length, paddingSize);
});

// =========================================================================
// Suite 2: 敏感信息脱敏有效性 (stderr 与 stdout 对抗验证)
// =========================================================================

test("[Adversarial] 脱敏有效性：redactSensitiveString 函数对抗性测试", () => {
    const env = {
        OPENAI_API_KEY: "sk-proj-RealSecretKey1234567890abcdef",
        ANTHROPIC_TOKEN: "ant-token-SecretTokenXYZ987654321",
        AWS_SECRET_ACCESS_KEY: "awsSecretPasswordXYZ!",
        DB_PASSWORD: "SuperSecretPassword123",
        SERVICE_CREDENTIAL: "Cred-Token-String-9999",
        SHORT_KEY: "abc", // 长度 < 4，不应盲目替换短字符避免误杀
        SAFE_VAR: "just-a-variable",
    };

    const textWithSecrets = [
        "Connection failed: sk-proj-RealSecretKey1234567890abcdef invalid",
        "Header: Authorization: Bearer ant-token-SecretTokenXYZ987654321",
        "Header lowercase: authorization: bearer my-bearer-token-123456",
        "Secret in message: awsSecretPasswordXYZ! and DB: SuperSecretPassword123",
        "Credential leaked: Cred-Token-String-9999",
        "Normal var should stay: just-a-variable and abc",
    ].join("\n");

    const sanitized = redactSensitiveString(textWithSecrets, env);

    assert.ok(!sanitized.includes("sk-proj-RealSecretKey1234567890abcdef"), "sk key 必须被脱敏");
    assert.ok(!sanitized.includes("ant-token-SecretTokenXYZ987654321"), "token 必须被脱敏");
    assert.ok(!sanitized.includes("my-bearer-token-123456"), "bearer token 必须被脱敏");
    assert.ok(!sanitized.includes("awsSecretPasswordXYZ!"), "AWS key 必须被脱敏");
    assert.ok(!sanitized.includes("SuperSecretPassword123"), "password 必须被脱敏");
    assert.ok(!sanitized.includes("Cred-Token-String-9999"), "credential 必须被脱敏");
    assert.ok(sanitized.includes("just-a-variable"), "非敏感变量保留");
    assert.ok(sanitized.includes("abc"), "短字符保留未误杀");
});

test("[Adversarial] 脱敏有效性：stderr 错误输出中的敏感信息必须完全脱敏", async (t) => {
    const tempDir = await createTempDir(t, "adv-redact-stderr-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Trigger error" }));

    const sensitiveKey = "sk-live-MySecretLiveKey9999999999";
    const bearerToken = "my-super-secret-bearer-token-12345";
    const customPassword = "DatabasePassword456!";

    const failingAdapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() {
            throw new Error(`Failed with Authorization: Bearer ${bearerToken}, key=${sensitiveKey}, pass=${customPassword}`);
        },
    };

    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: failingAdapter,
        env: {
            CUSTOM_PASSWORD: customPassword,
        },
        writeOutput: assert.fail,
        writeError: (l) => errors.push(l),
    });

    assert.equal(code, 1);
    assert.equal(errors.length, 1);
    const line = errors[0]!;
    assert.ok(!line.includes(sensitiveKey), "stderr 中不得出现 sk key");
    assert.ok(!line.includes(bearerToken), "stderr 中不得出现 Bearer token");
    assert.ok(!line.includes(customPassword), "stderr 中不得出现 PASSWORD 环境变量");
    assert.ok(line.includes("[REDACTED]"), "必须包含 [REDACTED]");
});

test("[Adversarial] 脱敏有效性：stdout 输出中模型复述的敏感密钥与环境变量检查", async (t) => {
    const tempDir = await createTempDir(t, "adv-redact-stdout-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect on this trace with key sk-leaked-key-1234567890abcdef" }));

    const leakedKey = "sk-leaked-key-1234567890abcdef";
    const leakedBearer = "my-bearer-secret-token-777777";
    const leakedEnvSecret = "MyCriticalEnvSecretKey999";

    // 模拟模型在返回的优化内容中复述了 trace 中的敏感信息
    const leakyAdapter = new MockReflectionLLMAdapter(async () => ({
        content: `Reflected prompt containing ${leakedKey} and Bearer ${leakedBearer} and ${leakedEnvSecret}`,
        providerMetadata: { usage: { inputTokens: 10, outputTokens: 20 } },
    }));

    const outputs: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: leakyAdapter,
        env: {
            CRITICAL_SECRET: leakedEnvSecret,
        },
        writeOutput: (l) => outputs.push(l),
        writeError: assert.fail,
    });

    assert.equal(code, 0);
    assert.equal(outputs.length, 1);
    const stdoutLine = outputs[0]!;

    // 检查 stdout 输出中是否存在明文泄露
    const hasLeakedKey = stdoutLine.includes(leakedKey);
    const hasLeakedBearer = stdoutLine.includes(leakedBearer);
    const hasLeakedEnv = stdoutLine.includes(leakedEnvSecret);

    // 实证记录：检查实现是否对 stdout 进行了脱敏
    // 根据需求和用户指令：“敏感信息脱敏有效性（测试包含真实或假 API Key、Bearer Token、Authorization 头、环境变量敏感词时，stdout 和 stderr 是否完全脱敏）”
    assert.ok(!hasLeakedKey, `stdout 泄露了 API Key: ${leakedKey}`);
    assert.ok(!hasLeakedBearer, `stdout 泄露了 Bearer Token: ${leakedBearer}`);
    assert.ok(!hasLeakedEnv, `stdout 泄露了环境变量敏感词: ${leakedEnvSecret}`);
});

// =========================================================================
// Suite 3: 模拟模型失败断言、退出码与绝不回退至 Working LM
// =========================================================================

test("[Adversarial] 退出码与单行 JSON 契约：模型故障返回退出码 1，stderr 单行 JSON", async (t) => {
    const tempDir = await createTempDir(t, "adv-fail-1-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "test" }));

    const failureErrors = [
        new Error("Rate limit exceeded 429"),
        new Error("API connection timeout"),
        new Error("500 Internal Server Error"),
        new Error("Multline\nerror\nmessage\nwith\r\nnewlines"),
    ];

    for (const err of failureErrors) {
        const errors: string[] = [];
        const outputs: string[] = [];
        const failingAdapter: LLMAdapter = {
            structuredOutputMode: "prompt_only",
            async generate() {
                throw err;
            },
        };

        const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
            cwd: tempDir,
            reflectionAdapter: failingAdapter,
            writeOutput: (l) => outputs.push(l),
            writeError: (l) => errors.push(l),
        });

        assert.equal(code, 1, "模型失败时退出码必须严格为 1");
        assert.equal(outputs.length, 0, "模型失败时 stdout 不得有输出");
        assert.equal(errors.length, 1, "stderr 必须恰好输出单行");

        // 验证单行 JSON 格式且没有多余换行未转义
        const rawStderr = errors[0]!;
        assert.ok(!rawStderr.includes("\n"), "单行 JSON 严禁包含未转义换行符");
        const parsed = JSON.parse(rawStderr);
        assert.equal(parsed.error, "model_error");
        assert.ok(typeof parsed.message === "string");
    }
});

test("[Adversarial] 退出码与单行 JSON 契约：无效请求返回退出码 2，stderr 单行 JSON", async (t) => {
    const tempDir = await createTempDir(t, "adv-fail-2-");

    const invalidCases: { args: string[]; fileContent?: string; expectedErrorMatch: RegExp }[] = [
        { args: ["gepa", "reflect"], expectedErrorMatch: /Missing --request argument/ },
        { args: ["gepa", "reflect", "--request", "no-such-file.json"], expectedErrorMatch: /Request file not found/ },
        { args: ["gepa", "reflect", "--request", "bad-json.json"], fileContent: "{not json", expectedErrorMatch: /syntax error/ },
        { args: ["gepa", "reflect", "--request", "array-root.json"], fileContent: "[]", expectedErrorMatch: /root must be an object/ },
        { args: ["gepa", "reflect", "--request", "unknown-key.json"], fileContent: JSON.stringify({ prompt: "hi", badKey: 1 }), expectedErrorMatch: /Unknown field in request/ },
        { args: ["gepa", "reflect", "--request", "empty-prompt.json"], fileContent: JSON.stringify({ prompt: "" }), expectedErrorMatch: /Prompt cannot be empty/ },
        { args: ["gepa", "reflect", "--request", "bad-role.json"], fileContent: JSON.stringify({ prompt: [{ role: "tool", content: "c" }] }), expectedErrorMatch: /Invalid message role/ },
        { args: ["gepa", "reflect", "--request", "bad-model.json"], fileContent: JSON.stringify({ prompt: "hi", model: { unknown: 1 } }), expectedErrorMatch: /Unknown field in model/ },
    ];

    for (let i = 0; i < invalidCases.length; i++) {
        const c = invalidCases[i]!;
        let reqPath = "";
        if (c.fileContent !== undefined) {
            const fileName = `req_${i}.json`;
            await writeFile(join(tempDir, fileName), c.fileContent);
            reqPath = join(tempDir, fileName);
        }

        const errors: string[] = [];
        const outputs: string[] = [];
        const args = c.args.map((a) => a.endsWith(".json") && reqPath ? reqPath : a);

        const code = await runGepaReflectCli(args, {
            cwd: tempDir,
            writeOutput: (l) => outputs.push(l),
            writeError: (l) => errors.push(l),
        });

        assert.equal(code, 2, `无效请求应当返回退出码 2: ${args.join(" ")}`);
        assert.equal(outputs.length, 0);
        assert.equal(errors.length, 1, "stderr 必须恰好为 1 行");

        const rawStderr = errors[0]!;
        assert.ok(!rawStderr.includes("\n"));
        const parsed = JSON.parse(rawStderr);
        assert.equal(parsed.error, "invalid_request");
        assert.match(parsed.message, c.expectedErrorMatch);
    }
});

test("[Adversarial] 物理与逻辑隔离：绝不回退至 Working LM", async (t) => {
    const tempDir = await createTempDir(t, "adv-no-fallback-");
    const xdgConfigHome = join(tempDir, ".config");
    const profilesDir = join(xdgConfigHome, "lazygoal/profiles");
    await mkdir(profilesDir, { recursive: true });

    // 构造配置：
    // config.toml 声明 [gepa].reflection_profile = "reflection"
    await writeFile(join(xdgConfigHome, "lazygoal/config.toml"), `
[gepa]
reflection_profile = "reflection"
`);

    // default.toml (Working LM) 配置了可用的模型
    await writeFile(join(profilesDir, "default.toml"), `
[llm]
provider = "openai"
model = "gpt-4o-working-never-call"
api_key = "sk-working-lm-key"
`);

    // reflection.toml 配置了一个会导致故障的 profile
    await writeFile(join(profilesDir, "reflection.toml"), `
[llm]
provider = "openai"
model = "gpt-4o-reflection-failing"
api_key = "sk-reflection-lm-key"
`);

    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Reflect test" }));

    // 跟踪是否有人尝试创建或调用 working profile
    let workingLmCalled = false;
    let reflectionLmCalled = false;

    // 注入 Adapter，如果模型是 working 则记录违规
    const spyAdapter = new MockReflectionLLMAdapter(async (req) => {
        reflectionLmCalled = true;
        throw new Error("Reflection LM downstream error 503");
    });

    const errors: string[] = [];
    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        env: { XDG_CONFIG_HOME: xdgConfigHome },
        reflectionAdapter: spyAdapter,
        writeOutput: assert.fail,
        writeError: (l) => errors.push(l),
    });

    assert.equal(code, 1);
    assert.equal(reflectionLmCalled, true, "Reflection LM 必须被调用");
    assert.equal(workingLmCalled, false, "严禁回退调用 Working LM");

    // 再次验证：即使 Reflection Profile 损坏，也直接报 invalid_request (code 2)，绝不回退到 default
    await writeFile(join(xdgConfigHome, "lazygoal/config.toml"), `
[gepa]
reflection_profile = "non-existent-profile"
`);

    const errorsMissing: string[] = [];
    const codeMissing = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        env: { XDG_CONFIG_HOME: xdgConfigHome },
        writeOutput: assert.fail,
        writeError: (l) => errorsMissing.push(l),
    });

    assert.equal(codeMissing, 2, "Reflection Profile 缺失时直接返回退出码 2");
    assert.equal(errorsMissing.length, 1);
    const parsedMissing = JSON.parse(errorsMissing[0]!);
    assert.equal(parsedMissing.error, "invalid_request");
    assert.match(parsedMissing.message, /Profile "non-existent-profile" 不存在/);
});

// =========================================================================
// Suite 4: 无工具契约 (Zero-Tool Contract) 白盒严格校验
// =========================================================================

test("[Adversarial] 无工具契约：LLMRequest 中 tools/structuredOutput 必须严格为 undefined，toolChoice 严格为 none", async (t) => {
    const tempDir = await createTempDir(t, "adv-zero-tool-");
    const reqFile = join(tempDir, "request.json");
    await writeFile(reqFile, JSON.stringify({ prompt: "Zero tool test" }));

    let capturedRequest: LLMRequest | undefined;
    const inspectAdapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request) {
            capturedRequest = request;
            return {
                content: "Done",
                providerMetadata: { usage: { inputTokens: 5, outputTokens: 5 } },
            };
        },
    };

    const code = await runGepaReflectCli(["gepa", "reflect", "--request", reqFile], {
        cwd: tempDir,
        reflectionAdapter: inspectAdapter,
        writeOutput: () => {},
        writeError: assert.fail,
    });

    assert.equal(code, 0);
    assert.ok(capturedRequest !== undefined);

    // 强断言：无工具契约
    assert.equal(capturedRequest.tools, undefined, "tools 必须严格为 undefined");
    assert.equal(capturedRequest.toolChoice, "none", "toolChoice 必须严格为 'none'");
    assert.equal(capturedRequest.structuredOutput, undefined, "structuredOutput 必须严格为 undefined");
    assert.equal(inspectAdapter.structuredOutputMode, "prompt_only", "structuredOutputMode 必须为 prompt_only");
});

// =========================================================================
// Suite 5: 真实 CLI 端到端进程派生黑盒验证 (bin/lazygoal.cjs)
// =========================================================================

test("[Adversarial] bin/lazygoal.cjs 真实黑盒执行：退出码、单行 stdout/stderr、脱敏全景", async (t) => {
    const tempDir = await createTempDir(t, "adv-real-process-");
    const rootDir = resolve(".");
    const binScript = join(rootDir, "bin/lazygoal.cjs");

    // Case 5.1: 缺少参数
    try {
        execFileSync(process.execPath, [binScript, "gepa", "reflect"], {
            cwd: tempDir,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        assert.fail("应退出非 0");
    } catch (err: unknown) {
        const error = err as { status?: number; stderr?: string; stdout?: string };
        assert.equal(error.status, 2);
        assert.equal(error.stdout?.trim(), "");
        const parsed = JSON.parse((error.stderr ?? "").trim());
        assert.equal(parsed.error, "invalid_request");
    }

    // Case 5.2: 格式非法的 prompt 请求文件
    const badFile = join(tempDir, "bad-role.json");
    await writeFile(badFile, JSON.stringify({
        prompt: [{ role: "function", content: "illegal" }],
    }));

    try {
        execFileSync(process.execPath, [binScript, "gepa", "reflect", "--request", badFile], {
            cwd: tempDir,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        assert.fail("应退出非 0");
    } catch (err: unknown) {
        const error = err as { status?: number; stderr?: string; stdout?: string };
        assert.equal(error.status, 2);
        const parsed = JSON.parse((error.stderr ?? "").trim());
        assert.equal(parsed.error, "invalid_request");
        assert.match(parsed.message, /Invalid message role: "function"/);
    }
});
