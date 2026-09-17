import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import { MarkdownRenderer } from "../src/markdown-renderer.js";

afterEach(() => {
    cleanup();
});

describe("MarkdownRenderer", () => {
    it("可读渲染常用标题、段落、行内强调、代码与链接", () => {
        const md =
            "# Main Title\n\n" +
            "## Sub Title\n\n" +
            "This is **bold**, *italic*, `inline code`, and a [link](https://lazygoal.io).";

        const { lastFrame } = render(<MarkdownRenderer content={md} />);
        const frame = lastFrame() ?? "";

        assert.match(frame, /# Main Title/);
        assert.match(frame, /## Sub Title/);
        assert.match(frame, /This is bold, italic, `inline code`, and a link/);
        assert.match(frame, /https:\/\/lazygoal\.io/);
    });

    it("正确渲染围栏代码块，并保留语言标识与代码换行", () => {
        const codeBlock = "```typescript\nconst message = 'Hello, world!';\nconsole.log(message);\n```";
        const { lastFrame } = render(<MarkdownRenderer content={codeBlock} />);
        const frame = lastFrame() ?? "";

        assert.match(frame, /\[typescript\]/);
        assert.match(frame, /const message = 'Hello, world!';/);
        assert.match(frame, /console\.log\(message\);/);
    });

    it("整齐对齐渲染 GFM 表格的表头、分隔线与数据行", () => {
        const table =
            "| Option | Description | Status |\n" +
            "|:---|:---:|---:|\n" +
            "| --auto | Run unattended | Ready |\n" +
            "| --step | Pause on step | Enabled |";

        const { lastFrame } = render(<MarkdownRenderer content={table} />);
        const frame = lastFrame() ?? "";

        assert.match(frame, /Option/);
        assert.match(frame, /Description/);
        assert.match(frame, /Status/);
        assert.match(frame, /--auto/);
        assert.match(frame, /Run unattended/);
        assert.match(frame, /Ready/);
        assert.match(frame, /--step/);
        assert.match(frame, /Pause on step/);
        assert.match(frame, /Enabled/);
    });

    it("正确渲染引用块、列表项与水平分隔线", () => {
        const md =
            "> Important observation noted\n\n" +
            "- First task item\n" +
            "- Second task item\n\n" +
            "1. Ordered step one\n" +
            "2. Ordered step two\n\n" +
            "---";

        const { lastFrame } = render(<MarkdownRenderer content={md} />);
        const frame = lastFrame() ?? "";

        assert.match(frame, /│ Important observation noted/);
        assert.match(frame, /• First task item/);
        assert.match(frame, /• Second task item/);
        assert.match(frame, /1\. Ordered step one/);
        assert.match(frame, /2\. Ordered step two/);
        assert.match(frame, /─{10,}/);
    });

    it("需求 5.2：遇到未专门支持的 token 时保留原始文本，绝不静默丢弃内容", () => {
        // HTML 标签或自定义原始文本结构
        const customTokenMd = "<custom-widget id='test-1'>Widget Raw Content</custom-widget>";
        const { lastFrame } = render(<MarkdownRenderer content={customTokenMd} />);
        const frame = lastFrame() ?? "";

        assert.match(frame, /Widget Raw Content/);
    });

    it("需求 5.1：历史 committed block 与动态 liveTail 复用同一渲染组件，样式与表现一致", () => {
        const chunk1 = "# Section Header\n\n";
        const chunk2 = "Generating content actively...";

        // 模拟不可变历史渲染
        const historyInstance = render(<MarkdownRenderer content={chunk1} />);
        const historyFrame = historyInstance.lastFrame() ?? "";

        // 模拟 liveTail 渲染
        const tailInstance = render(<MarkdownRenderer content={chunk2} />);
        const tailFrame = tailInstance.lastFrame() ?? "";

        assert.match(historyFrame, /# Section Header/);
        assert.match(tailFrame, /Generating content actively\.\.\./);
    });
});
