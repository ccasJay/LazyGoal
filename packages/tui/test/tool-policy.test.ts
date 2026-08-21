import assert from "node:assert/strict";
import { test } from "node:test";

import type { Goal, ToolCallAction } from "../../runtime/src/index";
import { createDefaultToolPolicy } from "../src/cli";
import { BASH_TOOL_ID } from "../../tools/src/index";
import { READ_FILE_TOOL_ID } from "../../tools/src/index";
import { WRITE_FILE_TOOL_ID } from "../../tools/src/index";

const goal = {} as Goal;
const action: ToolCallAction = {
    actionId: "action-1",
    toolId: "read_file",
    input: { path: "README.md" },
};

test("createDefaultToolPolicy 只自动放行只读 Tool 并对未知 Tool 关闭", () => {
    const policy = createDefaultToolPolicy();

    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: READ_FILE_TOOL_ID, description: "", inputSchema: {} },
        }),
        "allow",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: WRITE_FILE_TOOL_ID, description: "", inputSchema: {} },
        }),
        "require_approval",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: BASH_TOOL_ID, description: "", inputSchema: {} },
        }),
        "require_approval",
    );
    assert.equal(
        policy.evaluate({
            goal,
            action,
            tool: { id: "unknown_tool", description: "", inputSchema: {} },
        }),
        "require_approval",
    );
});
