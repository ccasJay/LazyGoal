import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { DEFAULT_TOOL_IDS } from "../src/index";

const catalogPath = new URL("../../../contracts/catalog.json", import.meta.url);
const benchmarkToolIds = ["submit_answer", "alfworld_reset", "alfworld_step", "bash_exec", "context_shell"] as const;
const expectedIdentities = new Map<string, "enabled" | "none">();

for (const toolId of [...DEFAULT_TOOL_IDS, ...benchmarkToolIds]) {
    expectedIdentities.set(`tool.${toolId}.input`, "none");
}

const enabledToolIds = new Set([
    "write_file",
    "edit_file",
    "apply_patch",
    "execute_program",
    "git_add",
    "git_commit",
    "git_branch_create",
    "git_branch_switch",
    "git_worktree_add",
    "git_worktree_remove",
    "git_branch_list",
    "git_worktree_list",
    "process_start",
    "process_stop",
    "submit_answer",
    "alfworld_reset",
    "alfworld_step",
    "context_shell",
]);

for (const toolId of enabledToolIds) {
    assert.equal(expectedIdentities.get(`tool.${toolId}.input`), "none", toolId);
    expectedIdentities.set(`tool.${toolId}.input`, "enabled");
}

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

    for (const [identity, expectedState] of expectedIdentities) {
        assert.equal(entries.has(identity), true, `missing Catalog entry for ${identity}`);
        assert.equal(entries.get(identity), expectedState, identity);
    }
});
