import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    buildProgramSeatbeltPolicy,
    isSeatbeltSupported,
    runProgramSandbox,
    SANDBOX_EXEC_PATH,
} from "../src/index";
import { collectProgramRuntimeFiles } from "../src/program-sandbox";

test("PTC worker keeps programs isolated and returns only explicit JSON", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const first = await runProgramSandbox({
        code: "globalThis.leak = 7; return { value: 3 };",
        onToolCall: async () => { throw new Error("unexpected call"); },
    });
    const second = await runProgramSandbox({
        code: "return { leaked: globalThis.leak === undefined };",
        onToolCall: async () => { throw new Error("unexpected call"); },
    });
    assert.deepEqual(first, { value: 3 });
    assert.deepEqual(second, { leaked: true });
});

test("PTC worker accepts tool results and rejects incomplete or invalid return", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const result = await runProgramSandbox({
        code: "const item = await tools.read_file({ path: 'a' }); return { length: item.text.length };",
        onToolCall: async (call) => {
            assert.deepEqual(call, { toolId: "read_file", input: { path: "a" } });
            return { text: "abc" };
        },
    });
    assert.deepEqual(result, { length: 3 });
    await assert.rejects(runProgramSandbox({
        code: "const p = tools.read_file({ path: 'a' }); return 1;",
        onToolCall: async () => ({ text: "abc" }),
    }), /PTC_UNAWAITED_CALL/);
    await assert.rejects(runProgramSandbox({
        code: "return undefined;",
        onToolCall: async () => null,
    }), /PTC_INVALID_RETURN/);
});

test("PTC enforces source and returned JSON byte limits", {
    skip: !isSeatbeltSupported(),
}, async () => {
    await assert.rejects(runProgramSandbox({
        code: `return 1;/*${"x".repeat(64 * 1024)}*/`,
        onToolCall: async () => null,
    }), /PTC_CODE_LIMIT/);
    await assert.rejects(runProgramSandbox({
        code: "return 'x'.repeat(64 * 1024);",
        onToolCall: async () => null,
    }), /PTC_RETURN_LIMIT/);
});

test("PTC delivers Promise.all tool calls in issue order", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const calls: number[] = [];
    const result = await runProgramSandbox({
        code: "const values = await Promise.all([tools.lookup({n:1}), tools.lookup({n:2}), tools.lookup({n:3})]); return values;",
        onToolCall: async ({ input }) => {
            const n = (input as { n: number }).n;
            calls.push(n);
            return n * 2;
        },
    });
    assert.deepEqual(calls, [1, 2, 3]);
    assert.deepEqual(result, [2, 4, 6]);
});

test("PTC worker has no direct process or dynamic code access", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const result = await runProgramSandbox({
        code: "return { process: typeof process, require: typeof require, fetch: typeof fetch, dynamic: (() => { try { return tools.read_file.constructor.constructor('return process')(); } catch { return 'blocked'; } })() };",
        onToolCall: async () => null,
    });
    assert.deepEqual(result, {
        process: "undefined", require: "undefined", fetch: "undefined", dynamic: "blocked",
    });
});

test("PTC Seatbelt policy blocks host file access at the kernel boundary", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const secretDir = await mkdtemp(join(tmpdir(), "ptc-secret-"));
    const privateDir = await mkdtemp(join(tmpdir(), "ptc-private-"));
    try {
        const secret = join(secretDir, "token");
        await writeFile(secret, "private");
        const node = realpathSync(process.execPath);
        const policy = buildProgramSeatbeltPolicy({
            runtimeFiles: Array.from(collectProgramRuntimeFiles(node)),
            privateTmpDir: privateDir,
            nodeExecutable: node,
        });
        const code = `const fs = require('node:fs');
            const result = {};
            try { result.read = fs.readFileSync(${JSON.stringify(secret)}, 'utf8'); }
            catch (error) { result.read = error.code; }
            try { fs.writeFileSync(${JSON.stringify(secret)}, 'changed'); result.write = 'allowed'; }
            catch (error) { result.write = error.code; }
            const child = require('node:child_process').spawnSync(${JSON.stringify(node)}, ['-e', 'process.stdout.write("escaped")']);
            result.process = child.error?.code ?? 'allowed';
            const server = require('node:net').createServer();
            server.on('error', (error) => {
                result.network = error.code;
                process.stdout.write(JSON.stringify(result));
            });
            server.listen(0, '127.0.0.1', () => {
                result.network = 'allowed';
                server.close(() => process.stdout.write(JSON.stringify(result)));
            });`;
        const probe = spawnSync(SANDBOX_EXEC_PATH, ["-p", policy, node, "-e", code], {
            encoding: "utf8",
            cwd: privateDir,
            env: { HOME: privateDir, TMPDIR: privateDir, PATH: "/usr/bin:/bin", OPENSSL_CONF: "/dev/null" },
            timeout: 5000,
        });
        assert.equal(probe.status, 0, probe.stderr);
        assert.deepEqual(JSON.parse(probe.stdout), {
            read: "EPERM", write: "EPERM", process: "EPERM", network: "EPERM",
        });
    } finally {
        await rm(secretDir, { recursive: true, force: true });
        await rm(privateDir, { recursive: true, force: true });
    }
});

test("PTC host watchdog stops an endless microtask chain", {
    skip: !isSeatbeltSupported(),
}, async () => {
    await assert.rejects(runProgramSandbox({
        code: "await new Promise((resolve) => { const again = () => Promise.resolve().then(again); again(); }); return 1;",
        onToolCall: async () => { throw new Error("unexpected call"); },
        timeoutMs: 500,
    }), /PTC_TIME_LIMIT/);
});

test("PTC host stops a worker above its RSS budget", {
    skip: !isSeatbeltSupported(),
}, async () => {
    await assert.rejects(runProgramSandbox({
        code: "const bytes = new Uint8Array(300 * 1024 * 1024); bytes.fill(1); while (true) bytes[0] = (bytes[0] + 1) & 255;",
        onToolCall: async () => null,
        timeoutMs: 10_000,
    }), /PTC_MEMORY_LIMIT/);
});

test("PTC reserves each active second before a long tool call can continue", {
    skip: !isSeatbeltSupported(),
}, async () => {
    let reservations = 0;
    const value = await runProgramSandbox({
        code: "await tools.slow({}); return {done:true};",
        onReserveTime: async () => { reservations += 1; },
        onToolCall: async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 1300));
            return { kind: "success" };
        },
        timeoutMs: 3000,
    });
    assert.deepEqual(value, { done: true });
    assert.ok(reservations >= 2);
});
