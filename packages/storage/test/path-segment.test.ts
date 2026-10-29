import assert from "node:assert/strict";
import { test } from "node:test";

import { encodePathSegment } from "../src/path-segment";

test("encodePathSegment 固定 ASCII 与 base64url 字符集输出", () => {
    assert.equal(encodePathSegment("goal-1"), "Z29hbC0x");
    assert.equal(encodePathSegment("run_ABC-123"), "cnVuX0FCQy0xMjM");
    assert.equal(encodePathSegment(""), "");
});

test("encodePathSegment 对 Unicode、斜杠、加号与等号输出 base64url", () => {
    assert.equal(encodePathSegment("src/中文.ts"), "c3JjL-S4reaWhy50cw");
    assert.equal(encodePathSegment("a+b"), "YSti");
    assert.equal(encodePathSegment("a=b"), "YT1i");
    assert.equal(
        encodePathSegment("goal-1"),
        Buffer.from("goal-1", "utf8").toString("base64url"),
    );
});
