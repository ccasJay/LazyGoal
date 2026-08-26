import {
    appendFile,
    mkdir,
    readFile,
} from "node:fs/promises";
import { join } from "node:path";

import type {
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
    assertValidTrajectoryEventDraft,
    classifyTrajectoryTail,
    freezeTrajectoryEvent,
    TrajectoryProtocolError,
} from "../../runtime/src/index";

/**
 * 基于 JSONL 文件的单进程 Trajectory Store。
 *
 * @remarks
 * 每个 `(goalId, runId)` 使用独立的
 * `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl` 文件。实例内追加
 * 按 Run 串行化并从已有最后序号继续分配；该实现不提供跨进程锁、Outbox 或
 * exactly-once 语义。Snapshot 的 `committedThroughSequence` 由调用方传入，
 * 不从 `state_committed` marker 推导。
 *
 * @example
 * ```ts
 * const store = new JsonFileTrajectoryStore(".lazygoal/trajectories");
 * await store.append(draft);
 * const view = await store.readWithBoundary(
 *     { goalId: "goal-1", runId: "run-1" },
 *     3,
 * );
 * ```
 */
export class JsonFileTrajectoryStore implements TrajectoryStore {
    private readonly appendQueues = new Map<string, Promise<unknown>>();

    /**
     * @param directory - JSONL 轨迹根目录；追加时按需创建 Goal 子目录。
     */
    constructor(private readonly directory: string) {}

    /**
     * 串行追加一个事实事件并分配同一 Run 内的下一个序号。
     *
     * @param draft - 已发生事实的 Domain Event 草稿。
     * @returns 深度冻结且与输入隔离的事件。
     * @throws 草稿或历史 JSONL 损坏时抛出 `TrajectoryProtocolError`；文件系统
     * 错误原样传播。
     */
    append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        assertValidTrajectoryEventDraft(draft);
        const key = this.keyFor(draft.goalId, draft.runId);
        const filePath = this.filePath(draft.goalId, draft.runId);
        const previous = this.appendQueues.get(key) ?? Promise.resolve();
        const operation = previous.catch(() => undefined).then(async () => {
            const existing = await this.readStoredEvents(
                filePath,
                draft.goalId,
                draft.runId,
            );
            const lastEvent = existing[existing.length - 1];
            const sequence = (lastEvent?.sequence ?? 0) + 1;
            const event = allocateImmutableEvent(draft, sequence);

            await mkdir(join(this.directory, this.encodeIdentifier(draft.goalId)), {
                recursive: true,
            });
            await appendFile(
                filePath,
                `${JSON.stringify(event)}\n`,
                { encoding: "utf8", mode: 0o600 },
            );
            return event;
        });
        let tracked: Promise<unknown>;
        tracked = operation.finally(() => {
            if (this.appendQueues.get(key) === tracked) {
                this.appendQueues.delete(key);
            }
        });
        this.appendQueues.set(key, tracked);
        return operation;
    }

    /**
     * 读取一个 Run 的严格 JSONL 事件。
     *
     * @param query - Goal/Run 标识和可选的闭区间序列范围。
     * @returns 按序号升序排列的深度冻结事件；文件不存在时返回空数组。
     * @throws 非法 JSON、事件协议、Goal/Run 标识或序列顺序错误时抛出
     * `TrajectoryProtocolError`。
     */
    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        this.assertQuery(query);
        const events = await this.readStoredEvents(
            this.filePath(query.goalId, query.runId),
            query.goalId,
            query.runId,
        );
        const fromSequence = query.fromSequence ?? 1;
        const toSequence = query.toSequence ?? Number.POSITIVE_INFINITY;

        return Object.freeze(events.filter((event) =>
            event.sequence >= fromSequence && event.sequence <= toSequence,
        ));
    }

    /**
     * 读取事件并以最新有效 Snapshot 的提交边界分类。
     *
     * @param query - Goal/Run 标识和可选的闭区间序列范围。
     * @param committedThroughSequence - Snapshot 记录的最大已提交序号。
     * @returns 不合并已提交事件与未提交 tail 的只读结果。
     * @throws 边界、查询或 JSONL 协议非法时拒绝。
     */
    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        const events = await this.read(query);
        return classifyTrajectoryTail(events, committedThroughSequence);
    }

    private async readStoredEvents(
        filePath: string,
        goalId: string,
        runId: string,
    ): Promise<readonly TrajectoryEvent[]> {
        let content: string;

        try {
            content = await readFile(filePath, "utf8");
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return [];
            }

            throw error;
        }

        const events: TrajectoryEvent[] = [];
        let previousSequence = 0;
        const lines = content.split(/\r?\n/);

        for (const [index, line] of lines.entries()) {
            if (line.trim().length === 0) continue;

            let parsed: unknown;

            try {
                parsed = JSON.parse(line);
            } catch {
                throw new TrajectoryProtocolError(
                    `Invalid Trajectory JSONL at line ${index + 1}`,
                );
            }

            let event: Readonly<TrajectoryEvent>;

            try {
                event = freezeTrajectoryEvent(parsed as TrajectoryEvent);
            } catch {
                throw new TrajectoryProtocolError(
                    `Invalid Trajectory event at line ${index + 1}`,
                );
            }

            if (event.goalId !== goalId || event.runId !== runId) {
                throw new TrajectoryProtocolError(
                    `Trajectory event identity mismatch at line ${index + 1}`,
                );
            }

            if (event.sequence <= previousSequence) {
                throw new TrajectoryProtocolError(
                    `Trajectory sequence must increase at line ${index + 1}`,
                );
            }

            previousSequence = event.sequence;
            events.push(event);
        }

        return Object.freeze(events);
    }

    private assertQuery(query: TrajectoryReadQuery): void {
        this.keyFor(query.goalId, query.runId);
        const values = [query.fromSequence, query.toSequence];

        for (const value of values) {
            if (
                value !== undefined
                && (!Number.isInteger(value) || value < 0)
            ) {
                throw new TrajectoryProtocolError(
                    "Trajectory sequence range must use non-negative integers",
                );
            }
        }

        if (
            query.fromSequence !== undefined
            && query.toSequence !== undefined
            && query.fromSequence > query.toSequence
        ) {
            throw new TrajectoryProtocolError(
                "Trajectory sequence range is inverted",
            );
        }
    }

    private keyFor(goalId: string, runId: string): string {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        return `${goalId}\u0000${runId}`;
    }

    private filePath(goalId: string, runId: string): string {
        return join(
            this.directory,
            this.encodeIdentifier(goalId),
            `${this.encodeIdentifier(runId)}.jsonl`,
        );
    }

    private encodeIdentifier(value: string): string {
        this.assertIdentifier(value, "trajectory identifier");
        return Buffer.from(value, "utf8").toString("base64url");
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.length === 0) {
            throw new TrajectoryProtocolError(`${field} must be a non-empty string`);
        }
    }
}
