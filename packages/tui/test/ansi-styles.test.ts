import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";

import { ansi, formatGutter, formatSectionDivider } from "../src/ansi-styles";

test("section dividers fit terminal columns with ANSI, CJK, emoji and combining accents", () => {
    for (const width of [24, 46, 78]) {
        const output = formatSectionDivider("工具观察: cafe\u0301 👩‍💻 README.md", width, {
            icon: "◈", color: ansi.cyan, badge: "Awaiting approval", badgeColor: ansi.yellow,
        });
        const lines = output.split("\n");
        assert.ok(lines.every((line) => stringWidth(line) <= width), output);
        const text = stripVTControlCharacters(output).replaceAll("─", "").replace(/\s+/g, " ").normalize("NFC");
        assert.match(text, /工具观察: café 👩‍💻 README.md/);
        assert.match(text, /Awaiting approval/);
    }
});

test("wrapped output keeps a gutter on every visible line without losing indentation or content", () => {
    const content = '  "path": "目录/' + "界面".repeat(25) + '"\n\n  done';
    const output = formatGutter(content, { color: ansi.cyan, width: 24 });
    const lines = output.split("\n");
    assert.ok(lines.every((line) => stringWidth(line) <= 24));
    const plainLines = lines.map(stripVTControlCharacters);
    assert.ok(plainLines.every((line) => line.startsWith(" ▎ ")));
    assert.equal(plainLines.map((line) => line.slice(3)).join(""), content.replaceAll("\n", ""));
    assert.equal(plainLines[0]?.startsWith(' ▎   "path"'), true);
    assert.ok(plainLines.includes(" ▎ "));
});
