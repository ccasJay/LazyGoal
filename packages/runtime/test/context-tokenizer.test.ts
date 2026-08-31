import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContextTokenizerError,
    FieldTokenizer,
    buildContextInvertedIndex,
    type ContextSearchDocument,
} from "../src/index";

function document(
    documentId: string,
    path: string,
    body: string,
): ContextSearchDocument {
    const fields = {
        eventType: ["observation_recorded"],
        toolId: ["readFile"],
        actionId: ["actionRead2"],
        stepIndex: [2],
        path: [path],
        errorCode: [],
        objectId: ["object-7"],
        body,
    } as const;
    return {
        schemaVersion: 1,
        documentId,
        goalId: "goal-tokenizer",
        runId: "run-tokenizer",
        kind: "execution",
        phase: "executing",
        executionUnitId: documentId,
        firstSequence: documentId === "doc-a" ? 1 : 2,
        lastSequence: documentId === "doc-a" ? 1 : 2,
        sourceRange: {
            firstSequence: documentId === "doc-a" ? 1 : 2,
            lastSequence: documentId === "doc-a" ? 1 : 2,
        },
        sourceEventIds: [`event-${documentId}`],
        fields,
        body,
        eventTypes: fields.eventType,
        toolIds: fields.toolId,
        actionIds: fields.actionId,
        stepIndexes: fields.stepIndex,
        paths: fields.path,
        errorCodes: fields.errorCode,
        objectIds: fields.objectId,
    };
}

test("FieldTokenizer 保留精确标识并确定性拆分路径、camelCase、snake_case 和数字", () => {
    const tokenizer = new FieldTokenizer();
    const result = tokenizer.tokenize(document(
        "doc-a",
        "src/FooBar2_test.ts",
        "NFKC ＡＢＣ readFile foo_bar2",
    ));

    const pathTokens = result.fields.path.tokens;
    assert.deepEqual(
        pathTokens.map((token) => [token.value, token.kind]),
        [
            ["src/foobar2_test.ts", "exact"],
            ["src", "split"],
            ["foo", "split"],
            ["bar", "split"],
            ["2", "split"],
            ["test", "split"],
            ["ts", "split"],
        ],
    );
    assert.equal(pathTokens[0]?.raw, "src/FooBar2_test.ts");
    assert.deepEqual(
        result.fields.body.tokens.map((token) => token.value),
        ["nfkc", "abc", "read", "file", "foo", "bar", "2"],
    );
    assert.equal(result.fieldLengths.path, 7);
    assert.equal(result.fieldLengths.body, 7);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.fields.path.tokens), true);
});

test("FieldTokenizer 与倒排索引不依赖区域设置且重复构建 byte-stable", () => {
    const tokenizer = new FieldTokenizer();
    const first = tokenizer.tokenize(document("doc-a", "src/index.ts", "read config"));
    const second = tokenizer.tokenize(document("doc-b", "src/other.ts", "read test"));
    assert.deepEqual(first, tokenizer.tokenize(document("doc-a", "src/index.ts", "read config")));

    const left = buildContextInvertedIndex([
        document("doc-b", "src/other.ts", "read test"),
        document("doc-a", "src/index.ts", "read config"),
    ]);
    const right = buildContextInvertedIndex([
        document("doc-a", "src/index.ts", "read config"),
        document("doc-b", "src/other.ts", "read test"),
    ]);
    assert.equal(JSON.stringify(left), JSON.stringify(right));
    assert.deepEqual(left.documentIds, ["doc-a", "doc-b"]);
    assert.deepEqual(
        left.getPostings("path", "SRC/INDEX.TS").map((posting) => [
            posting.documentId,
            posting.termFrequency,
            posting.exactFrequency,
            posting.splitFrequency,
        ]),
        [["doc-a", 1, 1, 0]],
    );
    assert.equal(left.fieldStats.body.documentFrequency["read"], 2);
    assert.equal(left.fieldStats.body.averageFieldLength, 2);
    assert.deepEqual(first.fieldLengths, second.fieldLengths);
});

test("倒排索引拒绝重复文档或损坏文档，不返回部分结果", () => {
    const first = document("doc-a", "src/index.ts", "one");
    assert.throws(
        () => buildContextInvertedIndex([first, structuredClone(first)]),
        (error: unknown) => error instanceof ContextTokenizerError
            && /duplicate documentId/.test(error.message),
    );
    const broken = {
        ...first,
        fields: {
            ...first.fields,
            path: [42],
        },
    } as unknown as ContextSearchDocument;
    assert.throws(
        () => buildContextInvertedIndex([broken]),
        (error: unknown) => error instanceof ContextTokenizerError
            && /field must contain strings: path/.test(error.message),
    );
});
