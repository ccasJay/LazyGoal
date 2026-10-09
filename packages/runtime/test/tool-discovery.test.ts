import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import { createToolRegistration } from "../../tool-core/src/index";
import { createExecuteProgramRegistration, EXECUTE_PROGRAM_DEFINITION } from "../../tools/src/execute-program";
import { createGoal } from "../src/domain";
import { resolveAuthorizedToolDefinitions } from "../src/tool";
import { findTools } from "../src/tool-discovery";
import type { ToolDefinition } from "../../tool-core/src/index";
import { currentProtocols } from "./current-fixtures";

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

test("findTools keeps PTC inside the five results for the recorded mixed query", () => {
    const authorized = [
        tool("read_file", "Read a file in workspace"),
        tool("write_file", "Write a file in workspace"),
        tool("edit_file", "Edit a file in workspace"),
        tool("grep", "Search files in workspace"),
        tool("bash", "Run a shell command"),
        EXECUTE_PROGRAM_DEFINITION,
    ];
    const matches = findTools("file repo git search bash code ptc", authorized).tools;
    const ids = matches.map(({ id }) => id);

    assert.ok(matches.length <= 5);
    assert.ok(ids.includes("execute_program"));
    assert.ok(ids.indexOf("execute_program") < ids.indexOf("read_file"));
    assert.deepEqual(findTools("PTC", authorized).tools.map(({ id }) => id), ["execute_program"]);
    assert.deepEqual(findTools("程序化工具调用", authorized).tools.map(({ id }) => id), ["execute_program"]);
    assert.deepEqual(findTools("programmatic tool calling", authorized).tools.map(({ id }) => id), ["execute_program"]);
    assert.equal("discoveryAliases" in matches.find(({ id }) => id === "execute_program")!, false);
});

test("discovery aliases survive registration and Profile filtering without granting access", () => {
    const inputContract = contract.object({});
    const registration = createToolRegistration({
        definition: {
            id: "aliased_tool",
            description: "A test tool",
            discoveryAliases: ["special"],
            inputContract,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({ kind: "success", output: null, summary: "ok" }),
    });
    const program = createExecuteProgramRegistration();
    const registry = {
        get: (id: string) => id === registration.definition.id
            ? registration
            : id === program.definition.id ? program : undefined,
    };
    const goal = (toolIds: readonly string[]) => createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "alias-goal",
        intent: "Inspect files",
        profile: {
            id: "alias-profile",
            systemPrompt: "Inspect files",
            instructions: [],
            toolIds,
        },
        runId: "alias-run",
    });

    assert.deepEqual(registration.definition.discoveryAliases, ["special"]);
    const authorized = resolveAuthorizedToolDefinitions(
        goal(["aliased_tool", "execute_program"]), registry,
    );
    assert.deepEqual(authorized[0]?.discoveryAliases, ["special"]);
    assert.deepEqual(authorized[1]?.discoveryAliases, EXECUTE_PROGRAM_DEFINITION.discoveryAliases);
    assert.deepEqual(findTools("special ptc", authorized).tools.map(({ id }) => id), [
        "aliased_tool", "execute_program",
    ]);
    assert.deepEqual(findTools("ptc", resolveAuthorizedToolDefinitions(goal(["aliased_tool"]), registry)).tools, []);
    assert.deepEqual(findTools("ptc", resolveAuthorizedToolDefinitions(goal(["execute_program"]), { get: () => undefined })).tools, []);
});
