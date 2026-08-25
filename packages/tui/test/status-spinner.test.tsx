import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import { StatusSpinner } from "../src/index";

afterEach(() => {
    cleanup();
});

test("StatusSpinner renders the provided label", () => {
    const instance = render(<StatusSpinner label="Creating goal..." />);
    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Creating goal\.\.\./);
});

test("StatusSpinner reflects a different label verbatim", () => {
    const instance = render(<StatusSpinner label="Executing step..." />);
    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Executing step\.\.\./);
    assert.doesNotMatch(frame, /Creating goal/);
});
