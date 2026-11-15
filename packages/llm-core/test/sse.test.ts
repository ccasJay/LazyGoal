import assert from "node:assert/strict";
import { test } from "node:test";

import { ServerSentEventDecoder, readServerSentEvents } from "../src/sse";

test("SSE 分帧合并多行 data、忽略注释并派发空行消息", () => {
    const decoder = new ServerSentEventDecoder();
    const events = decoder.push(": keep-alive\nid: 7\nevent: delta\ndata: {\"a\":\ndata: 1}\n\n");
    assert.deepEqual(events, [{ event: "delta", data: "{\"a\":\n1}", id: "7" }]);
    assert.deepEqual(decoder.finish(), []);
});

test("SSE 分帧在任意字符边界保持正确", () => {
    const text = "data: first\r\n\r\ndata: second\n\n";
    for (let split = 0; split <= text.length; split += 1) {
        const decoder = new ServerSentEventDecoder();
        const events = [...decoder.push(text.slice(0, split)), ...decoder.push(text.slice(split)), ...decoder.finish()];
        assert.deepEqual(events.map(event => event.data), ["first", "second"], `split=${split}`);
    }
});

test("SSE 结束派发未以空行闭合的最后一条消息", () => {
    const decoder = new ServerSentEventDecoder();
    assert.deepEqual(decoder.push("data: tail"), []);
    assert.deepEqual(decoder.finish(), [{ data: "tail" }]);
});

test("SSE 字节流按 UTF-8 增量解码", async () => {
    const encoded = new TextEncoder().encode("data: 你好\n\ndata: 世界\n\n");
    async function* chunks() {
        yield encoded.slice(0, 8);
        yield encoded.slice(8);
    }
    const events = [];
    for await (const event of readServerSentEvents(chunks())) events.push(event.data);
    assert.deepEqual(events, ["你好", "世界"]);
});
