import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    StreamingTranscriptController,
    TranscriptProtocolError,
    type TranscriptScheduler,
    type TranscriptSnapshot,
} from "../src/streaming-transcript-controller.js";
import { collectMarkdownBlocks } from "../src/markdown-block-collector.js";

class FakeScheduler implements TranscriptScheduler {
    currentTime = 0;
    private nextId = 1;
    readonly tasks = new Map<number, { callback: () => void; dueTime: number }>();

    setTimeout(callback: () => void, ms: number): unknown {
        const id = this.nextId++;
        this.tasks.set(id, { callback, dueTime: this.currentTime + ms });
        return id;
    }

    clearTimeout(handle: unknown): void {
        this.tasks.delete(handle as number);
    }

    advance(ms: number): void {
        this.currentTime += ms;
        const dueIds: number[] = [];
        for (const [id, task] of this.tasks.entries()) {
            if (task.dueTime <= this.currentTime) {
                dueIds.push(id);
            }
        }
        // 按到期时间排序运行
        dueIds.sort((a, b) => this.tasks.get(a)!.dueTime - this.tasks.get(b)!.dueTime);
        for (const id of dueIds) {
            const task = this.tasks.get(id);
            if (task) {
                this.tasks.delete(id);
                task.callback();
            }
        }
    }

    runNext(): boolean {
        if (this.tasks.size === 0) return false;
        let earliestId: number | null = null;
        let earliestTime = Infinity;
        for (const [id, task] of this.tasks.entries()) {
            if (task.dueTime < earliestTime) {
                earliestTime = task.dueTime;
                earliestId = id;
            }
        }
        if (earliestId === null) return false;
        this.currentTime = earliestTime;
        const task = this.tasks.get(earliestId)!;
        this.tasks.delete(earliestId);
        task.callback();
        return true;
    }

    advanceAll(): void {
        let iterations = 0;
        while (this.tasks.size > 0 && iterations < 1000) {
            this.runNext();
            iterations++;
        }
    }
}

describe("Markdown Block Collector", () => {
    it("保留未换行的尾部行在 tail 中，并在 completed 时收束", () => {
        const r1 = collectMarkdownBlocks("Hello world", false);
        assert.deepEqual(r1.stableBlocks, []);
        assert.equal(r1.remainingTail, "Hello world");

        const r2 = collectMarkdownBlocks("Hello world", true);
        assert.deepEqual(r2.stableBlocks, ["Hello world"]);
        assert.equal(r2.remainingTail, "");
    });

    it("保留未闭合的围栏代码块在 tail 中，闭合并换行后提取为稳定 block", () => {
        const incompleteFence = "```ts\nconst x = 1;\n";
        const r1 = collectMarkdownBlocks(incompleteFence, false);
        assert.deepEqual(r1.stableBlocks, []);
        assert.equal(r1.remainingTail, incompleteFence);

        const closedFence = "```ts\nconst x = 1;\n```\n";
        const r2 = collectMarkdownBlocks(closedFence, false);
        assert.deepEqual(r2.stableBlocks, [closedFence]);
        assert.equal(r2.remainingTail, "");
    });

    it("保留缺少第二行前瞻的可能表格表头或 Setext 候选行在 tail 中", () => {
        // 单行包含管道符，未完成且无第二行
        const r1 = collectMarkdownBlocks("| col1 | col2 |\n", false);
        assert.deepEqual(r1.stableBlocks, []);
        assert.equal(r1.remainingTail, "| col1 | col2 |\n");

        // 单行普通文本，未完成且无第二行（可能变为 Setext 标题）
        const r2 = collectMarkdownBlocks("Possible Heading\n", false);
        assert.deepEqual(r2.stableBlocks, []);
        assert.equal(r2.remainingTail, "Possible Heading\n");
    });

    it("准确识别 Setext 标题并在遇到换行或空行后稳定", () => {
        const setext = "Section Title\n=============\n\n";
        const r1 = collectMarkdownBlocks(setext, false);
        assert.deepEqual(r1.stableBlocks, [setext]);
        assert.equal(r1.remainingTail, "");
    });

    it("表格必须在遇到空行终止后才视为稳定 block，流结束时直接收束", () => {
        const tableBody = "| A | B |\n|---|---|\n| 1 | 2 |\n";
        const r1 = collectMarkdownBlocks(tableBody, false);
        // 未遇到空行终止，表格仍可能追加数据行，保留在 tail
        assert.deepEqual(r1.stableBlocks, []);
        assert.equal(r1.remainingTail, tableBody);

        // 遇到空行终止
        const tableWithBlank = tableBody + "\n";
        const r2 = collectMarkdownBlocks(tableWithBlank, false);
        assert.deepEqual(r2.stableBlocks, [tableWithBlank]);
        assert.equal(r2.remainingTail, "");

        // 流结束时收束
        const r3 = collectMarkdownBlocks(tableBody, true);
        assert.deepEqual(r3.stableBlocks, [tableBody]);
        assert.equal(r3.remainingTail, "");
    });

    it("任意 delta 切分在 completed 时产生等价 block 顺序且全文拼接完全恒等", () => {
        const fixture =
            "# Document Title\n\n" +
            "This is the first paragraph with some details.\n\n" +
            "```javascript\nfunction test() {\n  return true;\n}\n```\n\n" +
            "| Key | Value |\n|---|---|\n| alpha | 1 |\n| beta | 2 |\n\n" +
            "Final conclusion text.";

        // 场景 A：一次性完整输入
        const singlePass = collectMarkdownBlocks(fixture, true);

        // 场景 B：按 1 个字符逐字分片输入
        let bufferB = "";
        const blocksB: string[] = [];
        for (let i = 0; i < fixture.length; i++) {
            bufferB += fixture[i];
            const isLast = i === fixture.length - 1;
            const res = collectMarkdownBlocks(bufferB, isLast);
            if (res.stableBlocks.length > 0) {
                blocksB.push(...res.stableBlocks);
                bufferB = res.remainingTail;
            }
            if (isLast && res.remainingTail.length > 0) {
                blocksB.push(res.remainingTail);
            }
        }

        // 场景 C：按 7 个字符分片输入
        let bufferC = "";
        const blocksC: string[] = [];
        const chunkSize = 7;
        for (let i = 0; i < fixture.length; i += chunkSize) {
            const chunk = fixture.slice(i, i + chunkSize);
            bufferC += chunk;
            const isLast = i + chunkSize >= fixture.length;
            const res = collectMarkdownBlocks(bufferC, isLast);
            if (res.stableBlocks.length > 0) {
                blocksC.push(...res.stableBlocks);
                bufferC = res.remainingTail;
            }
            if (isLast && res.remainingTail.length > 0) {
                blocksC.push(res.remainingTail);
            }
        }

        // 断言场景 A、B、C 产出完全相同的 block 列表
        assert.deepEqual(blocksB, singlePass.stableBlocks);
        assert.deepEqual(blocksC, singlePass.stableBlocks);
        // 全文无字符损失
        assert.equal(blocksB.join(""), fixture);
        assert.equal(blocksC.join(""), fixture);
        assert.equal(singlePass.stableBlocks.join(""), fixture);
    });
});

describe("StreamingTranscriptController", () => {
    it("严格遵循生命周期：正常接收 started -> delta* -> completed 并累积确定性快照", () => {
        const scheduler = new FakeScheduler();
        const controller = new StreamingTranscriptController({ scheduler });

        const snapshots: TranscriptSnapshot[] = [];
        controller.subscribe(s => snapshots.push(s));

        controller.started({ streamId: "s-1", messageId: "m-1" });
        assert.equal(controller.getText(), "");
        assert.equal(controller.getSnapshot().isStreaming, true);

        controller.delta({ streamId: "s-1", text: "Paragraph 1\n\n" });
        assert.equal(controller.getText(), "Paragraph 1\n\n");
        // stable block 已经进入 pendingBlocks
        assert.equal(controller.getSnapshot().pendingBlocks.length, 1);
        assert.equal(controller.getSnapshot().committedBlocks.length, 0);
        // liveTail 包含 pending 内容，保证未提交时不消失
        assert.equal(controller.getSnapshot().liveTail, "Paragraph 1\n\n");

        controller.completed({ streamId: "s-1" });
        assert.equal(controller.getSnapshot().isStreaming, false);
        assert.equal(controller.getText(), "Paragraph 1\n\n");

        // 推进调度器时间 40ms，使 pending 提交到 committed
        scheduler.advance(40);
        assert.equal(controller.getSnapshot().committedBlocks.length, 1);
        assert.equal(controller.getSnapshot().pendingBlocks.length, 0);
        assert.equal(controller.getSnapshot().liveTail, "");
        assert.equal(controller.getSnapshot().committedBlocks[0], "Paragraph 1\n\n");
    });

    it("协议乱序与并发流校验：未调用 started 发送 delta 或重入 started 抛出 TranscriptProtocolError 且不修改状态", () => {
        const scheduler = new FakeScheduler();
        const controller = new StreamingTranscriptController({ scheduler });

        // 1. 无活动流直接 delta
        assert.throws(
            () => controller.delta({ streamId: "s-1", text: "test" }),
            (err: any) => err instanceof TranscriptProtocolError && err.code === "TRANSCRIPT_PROTOCOL_ERROR",
        );
        assert.equal(controller.getSnapshot().streamId, null);

        // 2. 正常启动流 s-1
        controller.started({ streamId: "s-1", messageId: "m-1" });

        // 3. 在流进行中并发启动流 s-2
        assert.throws(
            () => controller.started({ streamId: "s-2", messageId: "m-2" }),
            (err: any) => err instanceof TranscriptProtocolError,
        );
        // 原流 s-1 状态不受影响
        assert.equal(controller.getSnapshot().streamId, "s-1");

        // 4. 发送错误 streamId 的 delta
        assert.throws(
            () => controller.delta({ streamId: "wrong-stream", text: "bad" }),
            (err: any) => err instanceof TranscriptProtocolError,
        );
        assert.equal(controller.getText(), "");
    });

    it("自适应 Commit Tick：按 40ms 节奏与 clamp(1, 8, ceil(N/8)) 公式分批提交", () => {
        const scheduler = new FakeScheduler();
        const controller = new StreamingTranscriptController({ scheduler });

        controller.started({ streamId: "s-1", messageId: "m-1" });

        // 构造 18 个独立的 Markdown 段落
        let text = "";
        for (let i = 1; i <= 18; i++) {
            text += `Paragraph ${i}\n\n`;
        }
        controller.delta({ streamId: "s-1", text });
        controller.completed({ streamId: "s-1" });

        // 此时有 18 个 pending block
        assert.equal(controller.getSnapshot().pendingBlocks.length, 18);
        assert.equal(controller.getSnapshot().committedBlocks.length, 0);

        // Tick 1: ceil(18 / 8) = 3 个 block
        scheduler.advance(40);
        assert.equal(controller.getSnapshot().committedBlocks.length, 3);
        assert.equal(controller.getSnapshot().pendingBlocks.length, 15);

        // Tick 2: ceil(15 / 8) = 2 个 block
        scheduler.advance(40);
        assert.equal(controller.getSnapshot().committedBlocks.length, 5);
        assert.equal(controller.getSnapshot().pendingBlocks.length, 13);

        // 推进剩余所有 Tick
        scheduler.advanceAll();
        assert.equal(controller.getSnapshot().committedBlocks.length, 18);
        assert.equal(controller.getSnapshot().pendingBlocks.length, 0);
        assert.equal(controller.getSnapshot().liveTail, "");
        assert.equal(controller.getSnapshot().committedBlocks.join(""), text);
    });

    it("flush() 同步提交所有 pendingBlocks 并取消计时器", () => {
        const scheduler = new FakeScheduler();
        const controller = new StreamingTranscriptController({ scheduler });

        controller.started({ streamId: "s-1", messageId: "m-1" });
        controller.delta({ streamId: "s-1", text: "Block 1\n\nBlock 2\n\nBlock 3\n\n" });
        controller.completed({ streamId: "s-1" });

        assert.equal(controller.getSnapshot().pendingBlocks.length, 3);
        assert.equal(controller.getSnapshot().committedBlocks.length, 0);

        // 同步 flush 屏障
        controller.flush();
        assert.equal(controller.getSnapshot().pendingBlocks.length, 0);
        assert.equal(controller.getSnapshot().committedBlocks.length, 3);
        assert.equal(scheduler.tasks.size, 0);
    });

    it("reset() 与 dispose() 取消定时器并使旧流失效，dispose 后拒绝任何后续调用", () => {
        const scheduler = new FakeScheduler();
        const controller = new StreamingTranscriptController({ scheduler });

        let notifiedCount = 0;
        controller.subscribe(() => notifiedCount++);

        controller.started({ streamId: "s-1", messageId: "m-1" });
        controller.delta({ streamId: "s-1", text: "Hello\n\n" });

        // reset
        controller.reset();
        assert.equal(controller.getSnapshot().streamId, null);
        assert.equal(controller.getText(), "");
        assert.equal(scheduler.tasks.size, 0);

        // 旧流已失效，向 s-1 发送 delta 必须报错
        assert.throws(
            () => controller.delta({ streamId: "s-1", text: "late delta" }),
            (err: any) => err instanceof TranscriptProtocolError,
        );

        // dispose
        controller.dispose();
        const countAtDispose = notifiedCount;

        // dispose 后不能再调用 started 或 delta
        assert.throws(
            () => controller.started({ streamId: "s-new", messageId: "m-new" }),
            (err: any) => err instanceof TranscriptProtocolError,
        );
        // 定时器为空，且不再通知已注销的订阅者
        scheduler.advanceAll();
        assert.equal(notifiedCount, countAtDispose);
    });
});
