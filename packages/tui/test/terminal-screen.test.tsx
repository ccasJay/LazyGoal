import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import React from "react";
import { render, Text } from "ink";
import { TerminalScreen } from "../src/terminal-screen";

function terminalOutput(isTTY: boolean) {
    const stream = Object.assign(new PassThrough(), { isTTY, columns: 80, rows: 24 });
    let output = "";
    stream.on("data", chunk => { output += String(chunk); });
    return { stream: stream as unknown as NodeJS.WriteStream, read: () => output };
}

test("only Inspector enters the alternate buffer and Ink unmount always restores the terminal", async t => {
    const output = terminalOutput(true);
    const view = (alternate: boolean, text: string) => <TerminalScreen alternate={alternate}>
        <Text>{text}</Text>
    </TerminalScreen>;
    const app = render(view(false, "Execution log"), {
        stdout: output.stream, patchConsole: false, exitOnCtrlC: false,
    });
    t.after(() => app.unmount());
    await delay(70);
    assert.ok(output.read().includes("Execution log"));
    assert.ok(!output.read().includes("\x1b[?1049h"));

    app.rerender(view(true, "Inspector step 1"));
    await delay(70);
    app.rerender(view(true, "Inspector step 2"));
    await delay(70);
    assert.equal(output.read().split("\x1b[?1049h").length - 1, 1);
    assert.ok(output.read().includes("Inspector step 2"));

    app.rerender(view(false, "History list"));
    await delay(70);
    assert.equal(output.read().split("\x1b[?1049l").length - 1, 1);
    assert.ok(output.read().includes("History list"));

    app.rerender(view(true, "Inspector reopened"));
    await delay(70);
    app.unmount();
    await app.waitUntilExit();
    assert.equal(output.read().split("\x1b[?1049h").length - 1, 2);
    assert.equal(output.read().split("\x1b[?1049l").length - 1, 2);
    assert.ok(output.read().includes("\x1b[0m\x1b[?1049l\x1b[?25h"));
});

test("redirected output never receives alternate-buffer escape sequences", async t => {
    const output = terminalOutput(false);
    const app = render(<TerminalScreen alternate><Text>Readable step</Text></TerminalScreen>, {
        stdout: output.stream, patchConsole: false, exitOnCtrlC: false,
    });
    t.after(() => app.unmount());
    await delay(70);
    app.unmount();
    await app.waitUntilExit();
    assert.ok(output.read().includes("Readable step"));
    assert.ok(!output.read().includes("\x1b[?1049"));
});
