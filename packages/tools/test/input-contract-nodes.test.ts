import assert from "node:assert/strict";
import { test } from "node:test";

import {
    inspectContractNode,
    type Contract,
} from "../../contracts/src/index";
import * as Tools from "../src/index";

/** 递归收集单个 Tool 输入合同声明的全部 AST 节点种类。 */
function collectContractKinds(root: unknown): Set<string> {
    const kinds = new Set<string>();
    const visited = new WeakSet<object>();
    const stack: unknown[] = [root];

    while (stack.length > 0) {
        const value = stack.pop();
        const inspection = inspectContractNode(value);
        assert.ok(inspection, "Tool input contract must contain only Contract nodes");
        if (inspection.category === "optional-property") {
            stack.push(inspection.node.inner);
            continue;
        }
        const node = inspection.node as Contract<unknown> & Readonly<Record<string, unknown>>;
        kinds.add(node.kind);
        if (visited.has(node)) continue;
        visited.add(node);

        switch (node.kind) {
            case "object":
            case "openObject": {
                const shape = node.shape as Record<string, unknown>;
                for (const property of Object.values(shape)) stack.push(property);
                break;
            }
            case "nullable":
                stack.push(node.inner);
                break;
            case "array":
                stack.push(node.items);
                break;
            case "record":
                stack.push(node.values);
                break;
            case "union":
            case "discriminatedUnion": {
                const branches = node.branches as readonly unknown[];
                for (const branch of branches) stack.push(branch);
                break;
            }
            case "recursive":
                stack.push(node.body);
                break;
            default:
                break;
        }
    }

    return kinds;
}

test("Tool 输入合同不得声明 unknown 或 openObject 节点（Req 1.6）", () => {
    const inputContracts = Object.entries(Tools)
        .filter(([name]) => name.endsWith("_INPUT_CONTRACT"));

    assert.ok(inputContracts.length >= 20, "expected to discover every Tool input contract");

    for (const [name, definition] of inputContracts) {
        const kinds = collectContractKinds(definition);
        assert.equal(kinds.has("unknown"), false, `${name} must not declare contract.unknown()`);
        assert.equal(kinds.has("openObject"), false, `${name} must not declare contract.openObject()`);
    }
});
