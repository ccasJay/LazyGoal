import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("model-catalog 生产源码不 import 线格式、适配器或供应商 SDK", async () => {
    const directory = fileURLToPath(new URL("../src", import.meta.url));
    const forbidden = /(?:from|import)\s*\(?\s*["']([^"']+)["']/gu;
    for (const name of await readdir(directory)) {
        if (!name.endsWith(".ts")) continue;
        const text = await readFile(join(directory, name), "utf8");
        for (const match of text.matchAll(forbidden)) {
            const specifier = match[1] ?? "";
            for (const prefix of ["wire-", "llm-adapters", "@earendil-works/pi-ai", "openai"]) {
                assert.equal(specifier.startsWith(prefix), false, `${name} must not import ${specifier}`);
            }
        }
    }
});
