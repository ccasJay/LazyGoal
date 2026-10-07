import assert from "node:assert/strict";
import test from "node:test";

import {
    contract,
    inspectContractNode,
} from "../src/index.js";
import * as contractsModule from "../src/index.js";

test("inspectContractNode correctly identifies standard contract nodes", () => {
    const stringNode = contract.string();
    const result = inspectContractNode(stringNode);
    assert.ok(result !== undefined);
    assert.equal(result.category, "contract");
    assert.equal(result.node, stringNode);
    assert.equal(result.node.kind, "string");

    const objectNode = contract.object({ id: contract.string() });
    const objResult = inspectContractNode(objectNode);
    assert.ok(objResult !== undefined);
    assert.equal(objResult.category, "contract");
    assert.equal(objResult.node, objectNode);
});

test("inspectContractNode correctly identifies optional property nodes", () => {
    const optionalNode = contract.optional(contract.number());
    const result = inspectContractNode(optionalNode);
    assert.ok(result !== undefined);
    assert.equal(result.category, "optional-property");
    assert.equal(result.node, optionalNode);
});

test("inspectContractNode correctly identifies recursive contract nodes", () => {
    const treeNode = contract.recursive("Tree", (self) =>
        contract.object({
            value: contract.string(),
            left: contract.optional(self),
        })
    );
    const result = inspectContractNode(treeNode);
    assert.ok(result !== undefined);
    assert.equal(result.category, "contract");
    assert.equal(result.node, treeNode);
    assert.equal(result.node.kind, "recursive");
});

test("inspectContractNode returns undefined for unknown values and plain objects", () => {
    assert.equal(inspectContractNode(null), undefined);
    assert.equal(inspectContractNode(undefined), undefined);
    assert.equal(inspectContractNode(123), undefined);
    assert.equal(inspectContractNode("string"), undefined);
    assert.equal(inspectContractNode({ kind: "string" }), undefined);
    assert.equal(inspectContractNode({ kind: "optional" }), undefined);
});

test("public exports do not expose private brand symbols", () => {
    const exportedKeys = Object.keys(contractsModule);
    for (const key of exportedKeys) {
        assert.ok(!key.toLowerCase().includes("brand"));
    }
    const symbolProperties = Object.getOwnPropertySymbols(contractsModule)
        .filter((sym) => sym !== Symbol.toStringTag);
    assert.equal(symbolProperties.length, 0);
});
