import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import type { Goal, ToolCallAction } from "../../runtime/src/index";
import { createDefaultToolPolicy } from "../src/cli";
import { BASH_TOOL_ID } from "../../tools/src/index";
import { EDIT_FILE_TOOL_ID } from "../../tools/src/index";
import { GREP_TOOL_ID } from "../../tools/src/index";
import { READ_FILE_TOOL_ID } from "../../tools/src/index";
import { WRITE_FILE_TOOL_ID } from "../../tools/src/index";

const goal = {} as Goal;
const action: ToolCallAction = {
    actionId: "action-1",
    toolId: "read_file",
    input: { path: "README.md" },
};
const EMPTY_INPUT_CONTRACT = contract.object({});

test("createDefaultToolPolicy 在非 macOS 平台只自动放行只读 Tool 并对 bash 和未知 Tool 关闭", () => {
    const policy = createDefaultToolPolicy({ platform: "linux" });

    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: READ_FILE_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: true },
        }),
        "allow",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: GREP_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: true },
        }),
        "allow",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: WRITE_FILE_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: false },
        }),
        "require_approval",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: EDIT_FILE_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: false },
        }),
        "require_approval",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: BASH_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: false },
        }),
        "require_approval",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: "unknown_tool", description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: false },
        }),
        "require_approval",
    );
});

test("createDefaultToolPolicy 在 macOS (darwin) 平台自动放行只读 Tool 和受限 bash", () => {
    const policy = createDefaultToolPolicy({ platform: "darwin" });

    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: READ_FILE_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: true },
        }),
        "allow",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: GREP_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: true },
        }),
        "allow",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: BASH_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: false },
        }),
        "allow",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: WRITE_FILE_TOOL_ID, description: "", inputContract: EMPTY_INPUT_CONTRACT, isReadOnly: false },
        }),
        "require_approval",
    );
});
