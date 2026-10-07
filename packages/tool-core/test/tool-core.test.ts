import assert from "node:assert/strict";
import test from "node:test";
import { contract } from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    throwIfAborted,
} from "../../execution-control/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
    type Tool,
    type ToolObservation,
    type ToolStreamEvent,
} from "../src/index";

test("TransientToolExecutionFailure 边界化 reason 与 retryAfterMs", () => {
    const defaultErr = new TransientToolExecutionFailure("");
    assert.equal(defaultErr.reason, "transient_tool_failure");
    assert.equal(defaultErr.message, "transient_tool_failure");
    assert.equal(defaultErr.retryAfterMs, undefined);

    const longReason = "a".repeat(200);
    const boundedErr = new TransientToolExecutionFailure(longReason, 50_000);
    assert.equal(boundedErr.reason.length, 120);
    assert.equal(boundedErr.retryAfterMs, 30_000);

    const negativeErr = new TransientToolExecutionFailure("err", -100);
    assert.equal(negativeErr.retryAfterMs, 0);
});

test("InMemoryToolRegistry 拒绝空 ID 与重复 ID 并正确查找", () => {
    const inputContract = contract.object({ msg: contract.string() });
    const toolA: Tool<typeof inputContract> = {
        definition: {
            id: "tool_a",
            description: "Tool A",
            inputContract,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({ kind: "success", output: "a", summary: "done" }),
    };

    const regA = createToolRegistration(toolA);
    const registry = new InMemoryToolRegistry([regA]);

    assert.equal(registry.get("tool_a"), regA);
    assert.equal(registry.get("non_existent"), undefined);

    assert.throws(
        () => new InMemoryToolRegistry([{ ...regA, definition: { ...regA.definition, id: "" } }]),
        /Tool definition id must be non-empty/,
    );

    assert.throws(
        () => new InMemoryToolRegistry([regA, regA]),
        /Duplicate Tool definition id: tool_a/,
    );
});

test("createToolRegistration 严格解析输入并保持单次解析及隔离", async () => {
    let parseCount = 0;
    const inputContract = contract.object({
        val: contract.string(),
    });

    let executedWith: unknown;
    const tool: Tool<typeof inputContract> = {
        definition: {
            id: "test_tool",
            description: "test tool",
            inputContract,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: (input) => {
            parseCount++;
            return input.val === "bad"
                ? {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: "val cannot be bad",
                        issues: [{ code: "custom", path: ["val"], message: "bad" }],
                    },
                }
                : { ok: true };
        },
        execute: async (req) => {
            executedWith = req.input;
            return {
                kind: "success",
                output: req.input.val,
                summary: "success",
            };
        },
    };

    const registration = createToolRegistration(tool);

    // 1. Contract 结构校验失败
    const invalidStructure = registration.prepare({ val: 123 });
    assert.equal(invalidStructure.ok, false);
    if (!invalidStructure.ok) {
        assert.equal(invalidStructure.error.code, "INVALID_TOOL_INPUT");
        assert.ok(invalidStructure.error.message.includes("test_tool 输入 Contract 校验失败"));
    }

    // 2. Tool 语义校验失败
    const invalidSemantics = registration.prepare({ val: "bad" });
    assert.equal(invalidSemantics.ok, false);
    if (!invalidSemantics.ok) {
        assert.equal(invalidSemantics.error.code, "INVALID_TOOL_INPUT");
        assert.equal(invalidSemantics.error.message, "val cannot be bad");
        assert.equal(invalidSemantics.error.issues?.[0]?.path[0], "val");
    }

    // 3. 严格校验拒绝未定义字段
    const invalidExtra = registration.prepare({ val: "hello", extra: "dropped" });
    assert.equal(invalidExtra.ok, false);
    if (!invalidExtra.ok) {
        assert.equal(invalidExtra.error.code, "INVALID_TOOL_INPUT");
        assert.ok(invalidExtra.error.message.includes("extra_field"));
    }

    // 4. 正常准备与执行
    const validRaw = { val: "hello" };
    const prepared = registration.prepare(validRaw);
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
        assert.deepEqual(prepared.input, { val: "hello" });

        const obs = await prepared.execute("action-1", { goalId: "g1", runId: "r1" });
        assert.deepEqual(obs, {
            kind: "success",
            output: "hello",
            summary: "success",
        });
        assert.deepEqual(executedWith, { val: "hello" });
    }
    // 只有两次结构合法调用进入了 tool.validate（invalidSemantics 和 validRaw），结构失败未调用 validate
    assert.equal(parseCount, 2);
});

test("createToolRegistration 支持流式执行与沙箱派生", async () => {
    const inputContract = contract.object({ num: contract.number() });
    const tool: Tool<typeof inputContract> = {
        definition: {
            id: "stream_tool",
            description: "streaming",
            inputContract,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        resolveSandboxAccess: (input) => ({
            files: [{ path: `/file-${input.num}`, access: "read", kind: "file", purpose: "test" }],
        }),
        execute: async () => ({ kind: "success", output: null, summary: "fallback" }),
        stream: async function* (req) {
            yield { kind: "output", channel: "stdout", text: `num is ${req.input.num}` };
            yield {
                kind: "completed",
                observation: { kind: "success", output: req.input.num, summary: "stream done" },
            };
        },
    };

    const registration = createToolRegistration(tool);
    const prepared = registration.prepare({ num: 42 });
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
        const access = await prepared.resolveSandboxAccess?.();
        assert.deepEqual(access, {
            files: [{ path: "/file-42", access: "read", kind: "file", purpose: "test" }],
        });

        assert.ok(prepared.stream);
        const events: ToolStreamEvent[] = [];
        for await (const event of prepared.stream("action-1", { goalId: "g1", runId: "r1" })) {
            events.push(event);
        }

        assert.equal(events.length, 2);
        assert.deepEqual(events[0], { kind: "output", channel: "stdout", text: "num is 42" });
        assert.deepEqual(events[1], {
            kind: "completed",
            observation: { kind: "success", output: 42, summary: "stream done" },
        });
    }
});

test("createToolRegistration 在准备与执行阶段传播中止信号", async () => {
    const inputContract = contract.object({ x: contract.string() });
    const tool: Tool<typeof inputContract> = {
        definition: {
            id: "abort_tool",
            description: "abort test",
            inputContract,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async (_req, control) => {
            throwIfAborted(control);
            return { kind: "success", output: "ok", summary: "done" };
        },
    };

    const registration = createToolRegistration(tool);
    const controller = new AbortController();
    controller.abort();

    assert.throws(
        () => registration.prepare({ x: "test" }, { signal: controller.signal }),
        (err: unknown) => err instanceof ExecutionAbortedError,
    );

    const normalPrepared = registration.prepare({ x: "test" });
    assert.equal(normalPrepared.ok, true);
    if (normalPrepared.ok) {
        await assert.rejects(
            async () => normalPrepared.execute("action-1", { goalId: "g", runId: "r" }, { signal: controller.signal }),
            (err: unknown) => err instanceof ExecutionAbortedError,
        );
    }
});
