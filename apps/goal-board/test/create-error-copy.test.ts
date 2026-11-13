import assert from "node:assert/strict";
import { test } from "node:test";

if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = {
        location: { hash: "", host: "localhost", protocol: "http:" },
        setTimeout,
        clearTimeout,
    };
}

const createErrorCodes = [
    "goal_id_conflict",
    "input_conflict",
    "goal_busy",
    "model_not_selectable",
    "model_catalog_unavailable",
    "profile_not_found",
    "invalid_goal_input",
    "goal_unreadable",
    "service_shutting_down",
    "execution_unavailable",
    "create_failed",
] as const;

function genericMessage(code: string): string {
    return `The local service could not complete this request (${code}).`;
}

test("每个创建错误码都映射到独立文案", async () => {
    const [{ BrowserApiError }, { errorMessage }] = await Promise.all([
        import("../src/api"),
        import("../src/types"),
    ]);
    const owners = new Map<string, string>();
    for (const code of createErrorCodes) {
        const message = errorMessage(new BrowserApiError(code, 0, false));
        assert.ok(message.trim().length > 0, code);
        assert.notEqual(message, genericMessage(code), `${code} fell back to the generic sentence`);
        const owner = owners.get(message);
        assert.equal(owner, undefined, `${code} duplicates the copy for ${String(owner)}`);
        owners.set(message, code);
    }
});

test("执行不可用文案说明重试并提示缩短 TMPDIR", async () => {
    const [{ BrowserApiError }, { errorMessage }] = await Promise.all([
        import("../src/api"),
        import("../src/types"),
    ]);
    const message = errorMessage(new BrowserApiError("execution_unavailable", 503, false));
    assert.match(message, /retry/ui);
    assert.match(message, /TMPDIR/u);
    assert.match(message, /100 characters/u);
});

test("未知失败码仍显示码文本", async () => {
    const [{ BrowserApiError }, { errorMessage }] = await Promise.all([
        import("../src/api"),
        import("../src/types"),
    ]);
    assert.equal(
        errorMessage(new BrowserApiError("unexpected_code", 500, false)),
        genericMessage("unexpected_code"),
    );
});
