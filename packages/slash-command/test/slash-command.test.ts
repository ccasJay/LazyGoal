import assert from "node:assert/strict";
import test from "node:test";

import {
    createSlashCommandRegistry,
    modelCommandDefinition,
    SLASH_COMMAND_ERROR_CODES,
    SlashCommandError,
} from "../src/index.js";
import type { ModelCommandEffect, SlashCommandDefinition } from "../src/types.js";

test("SlashCommandRegistry: 注册与合法命令名称校验", () => {
    const registry = createSlashCommandRegistry();

    // 合法名称：小写字母开头，包含小写字母、数字、连字符
    registry.register({
        name: "test-cmd-1",
        description: "A test command",
        usage: "/test-cmd-1",
        execute: () => ({ kind: "ok" }),
    });

    assert.equal(registry.get("test-cmd-1")?.name, "test-cmd-1");

    // 重复注册相同名称应稳定失败
    assert.throws(
        () => {
            registry.register({
                name: "test-cmd-1",
                description: "Duplicate",
                usage: "/test-cmd-1",
                execute: () => ({ kind: "ok" }),
            });
        },
        (err: unknown) => {
            assert(err instanceof SlashCommandError);
            assert.equal(err.code, SLASH_COMMAND_ERROR_CODES.DUPLICATE_NAME);
            return true;
        },
    );

    // 非法名称测试：大写、数字开头、下划线、空格、空字符串
    const invalidNames = ["Test", "1cmd", "cmd_1", "cmd 2", "", "-test", "test!"];
    for (const invalidName of invalidNames) {
        assert.throws(
            () => {
                registry.register({
                    name: invalidName,
                    description: "Invalid",
                    usage: `/${invalidName}`,
                    execute: () => ({ kind: "ok" }),
                });
            },
            (err: unknown) => {
                assert(err instanceof SlashCommandError);
                assert.equal(err.code, SLASH_COMMAND_ERROR_CODES.INVALID_NAME);
                return true;
            },
        );
    }
});

test("SlashCommandRegistry: list 与候选稳定升序排序", () => {
    const registry = createSlashCommandRegistry();

    registry.register({ name: "zebra", description: "z", usage: "/zebra", execute: () => {} });
    registry.register({ name: "alpha", description: "a", usage: "/alpha", execute: () => {} });
    registry.register({ name: "beta", description: "b", usage: "/beta", execute: () => {} });

    const list = registry.list();
    assert.deepEqual(
        list.map((c) => c.name),
        ["alpha", "beta", "zebra"],
    );

    // inspect "/" 返回全部候选并按字母排序
    const inspectAll = registry.inspect("/");
    assert.equal(inspectAll.kind, "candidates");
    if (inspectAll.kind === "candidates") {
        assert.deepEqual(
            inspectAll.candidates.map((c) => c.name),
            ["alpha", "beta", "zebra"],
        );
    }

    // inspect 前缀过滤
    const inspectB = registry.inspect("/b");
    assert.equal(inspectB.kind, "candidates");
    if (inspectB.kind === "candidates") {
        assert.deepEqual(
            inspectB.candidates.map((c) => c.name),
            ["beta"],
        );
    }

    // inspect 无匹配候选
    const inspectNone = registry.inspect("/gamma");
    assert.equal(inspectNone.kind, "candidates");
    if (inspectNone.kind === "candidates") {
        assert.equal(inspectNone.candidates.length, 0);
    }
});

test("SlashCommandRegistry: 普通文本与 // 转义", async () => {
    const registry = createSlashCommandRegistry();
    registry.register(modelCommandDefinition);

    // 普通文本不以 / 开头
    assert.deepEqual(registry.inspect("hello world"), { kind: "text" });
    assert.deepEqual(registry.inspect("   leading space text"), { kind: "text" });
    assert.deepEqual(registry.inspect(""), { kind: "text" });
    assert.deepEqual(registry.inspect("   "), { kind: "text" });

    // dispatch 普通文本
    const dispatchText = await registry.dispatch("hello world");
    assert.deepEqual(dispatchText, { kind: "text" });

    // // 转义：首个非空白为 //
    assert.deepEqual(registry.inspect("//hello"), {
        kind: "escaped_text",
        content: "/hello",
    });
    assert.deepEqual(registry.inspect("   //hello world"), {
        kind: "escaped_text",
        content: "   /hello world",
    });
    assert.deepEqual(registry.inspect("///nested"), {
        kind: "escaped_text",
        content: "//nested",
    });

    // dispatch // 转义
    const dispatchEscaped = await registry.dispatch("   //model");
    assert.deepEqual(dispatchEscaped, {
        kind: "escaped_text",
        content: "   /model",
    });
});

test("SlashCommandRegistry: 带前导空白的斜杠命令与调用解析", () => {
    const registry = createSlashCommandRegistry();
    registry.register(modelCommandDefinition);

    // 前导空白后单斜杠
    const inspectLeadingSlash = registry.inspect("   /m");
    assert.equal(inspectLeadingSlash.kind, "candidates");
    if (inspectLeadingSlash.kind === "candidates") {
        assert.deepEqual(
            inspectLeadingSlash.candidates.map((c) => c.name),
            ["model"],
        );
    }

    // 带参数的命令输入进入 invocation 态
    const inspectInv = registry.inspect("   /model  some-arg  ");
    assert.equal(inspectInv.kind, "invocation");
    if (inspectInv.kind === "invocation") {
        assert.equal(inspectInv.invocation.command, "model");
        assert.equal(inspectInv.invocation.args, "some-arg");
        assert.equal(inspectInv.invocation.raw, "   /model  some-arg  ");
    }

    // 带参数的未知命令返回 rejected
    const inspectUnknown = registry.inspect("/unknown-cmd arg");
    assert.equal(inspectUnknown.kind, "rejected");
    if (inspectUnknown.kind === "rejected") {
        assert.equal(inspectUnknown.code, SLASH_COMMAND_ERROR_CODES.UNKNOWN);
    }
});

test("SlashCommandRegistry: dispatch 未知命令与非法命令名", async () => {
    const registry = createSlashCommandRegistry();
    registry.register(modelCommandDefinition);

    // 未知命令
    const resUnknown = await registry.dispatch("/unknown");
    assert.deepEqual(resUnknown, {
        kind: "rejected",
        code: SLASH_COMMAND_ERROR_CODES.UNKNOWN,
        message: "Unknown slash command '/unknown'.",
    });

    // 仅有斜杠
    const resOnlySlash = await registry.dispatch("   /");
    assert.deepEqual(resOnlySlash, {
        kind: "rejected",
        code: SLASH_COMMAND_ERROR_CODES.INVALID_NAME,
        message: "Slash command name cannot be empty.",
    });

    // 非法名称
    const resInvalid = await registry.dispatch("/Invalid_Name");
    assert.equal(resInvalid.kind, "rejected");
    if (resInvalid.kind === "rejected") {
        assert.equal(resInvalid.code, SLASH_COMMAND_ERROR_CODES.INVALID_NAME);
    }
});

test("SlashCommandRegistry: modelCommandDefinition 执行与参数拒绝", async () => {
    const registry = createSlashCommandRegistry<ModelCommandEffect>();
    registry.register(modelCommandDefinition);

    // /model 无参数正常执行
    const res = await registry.dispatch("/model");
    assert.deepEqual(res, {
        kind: "executed",
        effect: { kind: "open_model_selector" },
    });

    // 带前导空白的 /model
    const resLeading = await registry.dispatch("   /model");
    assert.deepEqual(resLeading, {
        kind: "executed",
        effect: { kind: "open_model_selector" },
    });

    // /model 传入多余参数时应被拒绝
    const resArgs = await registry.dispatch("/model extra-arg");
    assert.deepEqual(resArgs, {
        kind: "rejected",
        code: SLASH_COMMAND_ERROR_CODES.INVALID_ARGS,
        message: "Command '/model' does not accept arguments.",
    });
});
