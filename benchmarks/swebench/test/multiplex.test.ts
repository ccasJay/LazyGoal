import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MUX_PROTOCOL_VERSION,
    MAX_MUX_FRAME_BYTES,
    MuxFrameDecoder,
    MuxProtocolError,
    MultiplexedConnection,
    encodeMuxFrame,
} from "../src/multiplex.js";

function bytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

test("MuxFrameDecoder accepts arbitrary chunk boundaries and preserves direction sequence", () => {
    const input = [
        encodeMuxFrame({ version: 1, channel: "acp", sequence: 1, payload: { id: 1 } }),
        encodeMuxFrame({ version: 1, channel: "llm", sequence: 2, payload: { id: 2 } }),
        encodeMuxFrame({ version: 1, channel: "acp", sequence: 3, payload: { id: 3 } }),
    ];
    const all = new Uint8Array(input.reduce((sum, item) => sum + item.byteLength, 0));
    let offset = 0;
    for (const item of input) { all.set(item, offset); offset += item.byteLength; }
    const decoder = new MuxFrameDecoder();
    const frames = [
        ...decoder.push(all.subarray(0, 2)),
        ...decoder.push(all.subarray(2, 11)),
        ...decoder.push(all.subarray(11)),
    ];
    decoder.finish();
    assert.deepEqual(frames.map((frame) => [frame.channel, frame.sequence, frame.payload.id]), [
        ["acp", 1, 1], ["llm", 2, 2], ["acp", 3, 3],
    ]);
});

test("MultiplexedConnection uses one ordered writer and routes channels independently", async () => {
    const input = new TransformStream<Uint8Array, Uint8Array>();
    const outputLines: string[] = [];
    const output = new WritableStream<Uint8Array>({
        write(chunk) { outputLines.push(new TextDecoder().decode(chunk)); },
    });
    const mux = new MultiplexedConnection({ input: input.readable, output, maxQueueBytes: 1024 });
    const acp = mux.channel<{ readonly id: number }>("acp");
    const llm = mux.channel<{ readonly id: number }>("llm");
    const acpWriter = acp.writable.getWriter();
    const llmWriter = llm.writable.getWriter();
    await Promise.all([
        acpWriter.write({ id: 1 }),
        llmWriter.write({ id: 2 }),
        acpWriter.write({ id: 3 }),
    ]);
    const frames = outputLines.join("").trim().split("\n").map((line) => JSON.parse(line) as { channel: string; sequence: number; payload: { id: number } });
    assert.deepEqual(frames.map((frame) => [frame.channel, frame.sequence, frame.payload.id]), [
        ["acp", 1, 1], ["llm", 2, 2], ["acp", 3, 3],
    ]);
    await mux.close();
});

test("invalid sequence closes both streams and never produces a payload", async () => {
    const input = new TransformStream<Uint8Array, Uint8Array>();
    const output = new WritableStream<Uint8Array>();
    const mux = new MultiplexedConnection({ input: input.readable, output });
    const acp = mux.channel("acp");
    const reader = acp.readable.getReader();
    const inputWriter = input.writable.getWriter();
    await inputWriter.write(bytes(`${JSON.stringify({ version: 1, channel: "acp", sequence: 2, payload: { id: 1 } })}\n`));
    await assert.rejects(reader.read(), (error: unknown) => {
        assert.ok(error instanceof MuxProtocolError);
        assert.equal(error.code, "invalid_sequence");
        return true;
    });
    assert.equal(mux.failure?.code, "invalid_sequence");
    await mux.closed;
});

test("frame and queue byte limits reject oversized or backpressured writes", async () => {
    assert.throws(
        () => encodeMuxFrame({ version: MUX_PROTOCOL_VERSION, channel: "acp", sequence: 1, payload: { value: "x".repeat(100) } }, 32),
        (error: unknown) => error instanceof MuxProtocolError && error.code === "frame_too_large",
    );
    const input = new TransformStream<Uint8Array, Uint8Array>();
    const mux = new MultiplexedConnection({ input: input.readable, output: new WritableStream(), maxQueueBytes: 32 });
    const port = mux.channel("acp");
    const writer = port.writable.getWriter();
    await assert.rejects(writer.write({ value: "x".repeat(100) }), (error: unknown) => {
        assert.ok(error instanceof MuxProtocolError);
        assert.equal(error.code, "queue_overflow");
        return true;
    });
    await mux.close();
});
