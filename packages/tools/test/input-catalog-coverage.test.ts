import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { DEFAULT_TOOL_IDS } from "../src/index";

const catalogPath = new URL("../../../contracts/catalog.json", import.meta.url);
const benchmarkToolIds = ["submit_answer", "alfworld_reset", "alfworld_step", "bash_exec", "context_shell"] as const;
const expectedIdentities = new Set(
    [...DEFAULT_TOOL_IDS, ...benchmarkToolIds].map(toolId => `tool.${toolId}.input`),
);

test("工具输入覆盖表与 Catalog 的实际生成登记一致", async () => {
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
        readonly entries: readonly {
            readonly key: string;
            readonly protocol: { readonly identity: { readonly value?: unknown } };
            readonly generation: { readonly state: string };
        }[];
    };
    const entries = new Map(catalog.entries.map(entry =>
        [String(entry.protocol.identity.value), entry.generation.state] as const,
    ));

    for (const identity of expectedIdentities) {
        assert.equal(entries.get(identity), "enabled", identity);
    }
});
