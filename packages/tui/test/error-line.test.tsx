import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import { ErrorLine } from "../src/index";

afterEach(() => {
    cleanup();
});

test("ErrorLine renders code and message when code is present", () => {
    const instance = render(
        <ErrorLine error={{ code: "INVALID_GOAL_INPUT", message: "Intent must not be empty" }} />,
    );
    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Error \[INVALID_GOAL_INPUT\]: Intent must not be empty/);
});

test("ErrorLine omits the code bracket when code is absent", () => {
    const instance = render(
        <ErrorLine error={{ message: "Message must not be empty" }} />,
    );
    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Error: Message must not be empty/);
});
