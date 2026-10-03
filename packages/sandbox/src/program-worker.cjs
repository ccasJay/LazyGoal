"use strict";

const fs = require("node:fs");
const vm = require("node:vm");

const input = fs.createReadStream(null, { fd: 3, autoClose: false });
const output = fs.createWriteStream(null, { fd: 4, autoClose: false });
let buffer = "";
let pending = new Map();
let nextId = 0;
let active = false;

function send(message) {
    const line = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(line) > 16 * 1024 * 1024) throw new Error("PTC_FRAME_LIMIT");
    output.write(line);
}

function jsonSafe(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const valid = Array.isArray(value)
        ? value.every((entry) => jsonSafe(entry, seen))
        : Object.keys(value).every((key) => jsonSafe(value[key], seen));
    seen.delete(value);
    return valid;
}

function toolCall(toolId, value) {
    if (!active) return Promise.reject(new Error("PTC_NOT_RUNNING"));
    if (!jsonSafe(value)) return Promise.reject(new Error("PTC_INVALID_TOOL_INPUT"));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: "call", id, toolId, input: value });
    });
}

async function run(message) {
    if (active) throw new Error("PTC_PROTOCOL_ERROR");
    active = true;
    const context = vm.createContext({
        __seed: message.seed >>> 0,
        __time: message.fixedTime,
        __bridge: toolCall,
        console: undefined, process: undefined, require: undefined,
        fetch: undefined, Buffer: undefined, WebAssembly: undefined,
        eval: undefined, Function: undefined, setTimeout: undefined,
        setInterval: undefined, setImmediate: undefined,
    }, { codeGeneration: { strings: false, wasm: false } });
    try {
        vm.runInContext(`{
            let seed = __seed;
            const time = __time;
            const bridge = __bridge;
            const NativeDate = Date;
            globalThis.Date = class extends NativeDate {
                constructor(...args) { super(...(args.length === 0 ? [time] : args)); }
                static now() { return time; }
            };
            Math.random = () => {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            globalThis.tools = new Proxy(Object.create(null), {
                get(_target, toolId) {
                    if (typeof toolId !== "string" || !/^[a-z][a-z0-9_]*$/.test(toolId)) return undefined;
                    return (value) => bridge(toolId, value);
                },
            });
            delete globalThis.__seed;
            delete globalThis.__time;
            delete globalThis.__bridge;
        }`, context, { timeout: 1000 });
        const script = new vm.Script(`(async function() { "use strict";\n${message.code}\n})()`, {
            filename: "program.js",
        });
        const result = await script.runInContext(context, { timeout: 1000 });
        if (pending.size !== 0) throw new Error("PTC_UNAWAITED_CALL");
        if (result === undefined || !jsonSafe(result)) throw new Error("PTC_INVALID_RETURN");
        send({ type: "return", value: result });
    } catch (error) {
        send({ type: "error", code: String(error?.message ?? error).slice(0, 120) });
    } finally {
        active = false;
        output.end();
        input.destroy();
    }
}

input.setEncoding("utf8");
input.on("data", (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) process.exit(2);
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { process.exit(2); }
        if (message.type === "start") {
            void run(message);
        } else if (message.type === "result") {
            const waiter = pending.get(message.id);
            if (waiter === undefined) process.exit(2);
            pending.delete(message.id);
            waiter.resolve(message.value);
        } else {
            process.exit(2);
        }
    }
});
input.on("end", () => process.exit(2));
