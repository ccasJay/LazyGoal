import assert from "node:assert/strict";
import { test } from "node:test";

import {
    computeCanonicalDigest,
    decodeAndValidateCursor,
    encodeCursor,
} from "../src/internal/cursor";

test("computeCanonicalDigest 固定键序无关的字面量摘要", () => {
    assert.equal(
        computeCanonicalDigest({ path: "src/中文.ts", limit: 50 }),
        "6a6a504a5d9225c8e1b97dc33a5e6caa6d85760eba3fda7f252b097d8ee93389",
    );
    assert.equal(
        computeCanonicalDigest({ limit: 50, path: "src/中文.ts" }),
        computeCanonicalDigest({ path: "src/中文.ts", limit: 50 }),
    );
});

test("Cursor 编码与解码保持 payload 往返", () => {
    const payload = {
        toolId: "read_file",
        queryDigest: "abc",
        offset: 120,
    };

    const cursor = encodeCursor(payload);

    assert.equal(
        cursor,
        "eyJ0b29sSWQiOiJyZWFkX2ZpbGUiLCJxdWVyeURpZ2VzdCI6ImFiYyIsIm9mZnNldCI6MTIwfQ",
    );
    assert.deepEqual(
        decodeAndValidateCursor<typeof payload>(cursor, "read_file", "abc"),
        payload,
    );
});

test("Cursor 解码拒绝工具或查询摘要不匹配的载荷", () => {
    const cursor = encodeCursor({ toolId: "read_file", queryDigest: "abc", offset: 0 });

    assert.equal(decodeAndValidateCursor(cursor, "write_file", "abc"), undefined);
    assert.equal(decodeAndValidateCursor(cursor, "read_file", "other"), undefined);
    assert.equal(decodeAndValidateCursor("not-base64url!", "read_file", "abc"), undefined);
});
