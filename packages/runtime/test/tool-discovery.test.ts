import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import { findTools } from "../src/tool-discovery";
import type { ToolDefinition } from "../src/tool";

function tool(id: string, description: string): ToolDefinition {
    return {
        id,
        description,
        inputContract: contract.object({}),
        isReadOnly: true,
    };
}

test("findTools ranks matching authorized definitions stably and caps results at five", () => {
    const tools = [
        tool("read_file", "read file content"),
        tool("write_file", "write file content"),
        tool("grep", "search file content"),
        tool("list_directory", "list directory"),
        tool("find_files", "find files"),
        tool("show_file", "read file metadata"),
        tool("cat", "read file"),
    ];
    assert.deepEqual(findTools("READ file", tools).tools.map(({ id }) => id), [
        "read_file", "show_file", "cat", "write_file", "grep",
    ]);
});

test("findTools returns an empty result for no matches", () => {
    assert.deepEqual(findTools("unknown", [tool("read_file", "read a file")]), { tools: [] });
});
