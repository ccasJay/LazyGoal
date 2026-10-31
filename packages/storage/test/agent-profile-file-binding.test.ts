import assert from "node:assert/strict";
import { test } from "node:test";

import { agentProfileFileBinding } from "../src/generated/agent-profile-file-binding";

function validFile() {
    return {
        schemaVersion: 1,
        id: "default",
        name: "Default",
        description: "通用 LazyGoal Agent",
        systemPrompt: "You are LazyGoal.",
        instructions: ["Use only authorized tools."],
        toolIds: ["read_file"],
    };
}

test("generated binding accepts empty arrays and isolates the input", () => {
    const input = { ...validFile(), instructions: [], toolIds: [] };
    const result = agentProfileFileBinding.read(input, "reject");

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.data : undefined, input);
    assert.deepEqual(input, { ...validFile(), instructions: [], toolIds: [] });

    if (result.ok) {
        assert.notEqual(result.data, input);
        assert.notEqual(result.data.instructions, input.instructions);
    }
});

test("generated binding rejects empty strings, empty elements, unknown fields and wrong versions", () => {
    const { toolIds: _toolIds, ...missingToolIds } = validFile();
    const cases: readonly [string, unknown, string, string][] = [
        ["empty scalar", { ...validFile(), id: "" }, "/id", "length"],
        ["empty array element", { ...validFile(), instructions: [""] }, "/instructions/0", "length"],
        ["unknown field", { ...validFile(), extra: true }, "/extra", "unknown"],
        ["wrong version", { ...validFile(), schemaVersion: 2 }, "/schemaVersion", "const"],
        ["missing field", missingToolIds, "/toolIds", "required"],
        ["wrong type", { ...validFile(), toolIds: "read_file" }, "/toolIds", "type"],
    ];

    for (const [name, value, path, code] of cases) {
        const result = agentProfileFileBinding.read(value, "reject");

        assert.equal(result.ok, false, name);
        if (!result.ok) {
            assert.deepEqual(
                result.issues.some(issue => issue.path === path && issue.code === code),
                true,
                `${name}: ${JSON.stringify(result.issues)}`,
            );
            assert.equal("data" in result, false, name);
        }
    }
});

test("generated schema applies the named non-empty constraint to scalars and array items", () => {
    const definitions = agentProfileFileBinding.schema.definitions ?? {};
    const nonEmpty = definitions.NonEmptyString;
    const root = agentProfileFileBinding.schema.$ref === "#/definitions/AgentProfileFile"
        ? definitions.AgentProfileFile
        : agentProfileFileBinding.schema;

    assert.equal(nonEmpty?.type, "string");
    assert.equal(nonEmpty?.minLength, 1);
    assert.equal(root?.properties?.id?.$ref, "#/definitions/NonEmptyString");
    assert.equal(root?.properties?.instructions?.items?.$ref, "#/definitions/NonEmptyString");
    assert.equal(root?.properties?.toolIds?.items?.$ref, "#/definitions/NonEmptyString");
});
