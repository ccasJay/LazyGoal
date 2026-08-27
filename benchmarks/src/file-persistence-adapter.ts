import { resolve, join } from "node:path";

import {
    JsonFileDiagnosticTraceSink,
    JsonFileGoalStore,
    JsonFileTrajectoryStore,
} from "../../packages/storage/src/index.js";
import type {
    BenchmarkPersistenceAdapter,
    BenchmarkPersistenceBindings,
    BenchmarkPersistenceContext,
} from "./headless-composition-root.js";

/**
 * 基于本地文件的 benchmark 持久化适配配置。
 *
 * @remarks
 * 该配置只负责 benchmark task 到 namespace 的映射和根目录选择；具体 Snapshot、
 * Trajectory、Trace 编解码与提交语义仍由 LazyGoal Storage 实现。namespace 会被
 * 编码为单个目录名，避免 task 标识改变目录层级或逃逸根目录。
 *
 * @example
 * ```ts
 * const options: FilePersistenceAdapterOptions<MyTask> = {
 *     rootDirectory: ".lazygoal/benchmarks",
 *     namespaceFor: (task) => task.id,
 *     enableTrace: true,
 * };
 * ```
 */
export interface FilePersistenceAdapterOptions<TTask> {
    /** 所有 benchmark 持久化数据使用的根目录。 */
    readonly rootDirectory: string;
    /** 将 benchmark task 转换为稳定、可隔离 namespace 的函数。 */
    readonly namespaceFor: (task: TTask) => string;
    /** 是否为每个 task 创建独立 Diagnostic Trace 文件；默认关闭。 */
    readonly enableTrace?: boolean;
}

/**
 * 使用 LazyGoal JSON 文件 Store 的通用 benchmark 持久化适配器。
 *
 * @remarks
 * 每个 benchmark 和 task 都会得到独立的 Goal、Trajectory 和可选 Trace 目录；
 * 目录名由稳定标识编码得到。此类不实现新的存储协议，也不从 marker 推导提交
 * 边界，所有语义由 `@lazygoal/storage` 与 Runtime Port 保持。
 *
 * @example
 * ```ts
 * const persistence = new JsonFileBenchmarkPersistenceAdapter({
 *     rootDirectory: ".lazygoal/benchmarks",
 *     namespaceFor: (task: MyTask) => task.id,
 * });
 * ```
 */
export class JsonFileBenchmarkPersistenceAdapter<TTask>
    implements BenchmarkPersistenceAdapter<TTask> {
    private readonly rootDirectory: string;
    private readonly namespaceMapper: (task: TTask) => string;
    private readonly enableTrace: boolean;

    /** @param options - 文件根目录、namespace 映射和 Trace 开关。 */
    constructor(options: FilePersistenceAdapterOptions<TTask>) {
        if (typeof options.rootDirectory !== "string" || options.rootDirectory.trim() === "") {
            throw new TypeError("rootDirectory must be non-empty text");
        }
        if (typeof options.namespaceFor !== "function") {
            throw new TypeError("namespaceFor must be a function");
        }
        this.rootDirectory = resolve(options.rootDirectory);
        this.namespaceMapper = options.namespaceFor;
        this.enableTrace = options.enableTrace ?? false;
    }

    /** @inheritdoc */
    namespaceFor(task: TTask): string {
        const namespace = this.namespaceMapper(task);
        if (typeof namespace !== "string" || namespace.trim() === "") {
            throw new TypeError("persistence namespace must be non-empty text");
        }
        return namespace;
    }

    /** @inheritdoc */
    async open(
        context: BenchmarkPersistenceContext,
    ): Promise<BenchmarkPersistenceBindings> {
        assertIdentifier(context.benchmarkId, "benchmarkId");
        assertIdentifier(context.namespace, "namespace");
        assertIdentifier(context.goalId, "goalId");
        assertIdentifier(context.runId, "runId");

        const directory = join(
            this.rootDirectory,
            encodeIdentifier(context.benchmarkId),
            encodeIdentifier(context.namespace),
        );
        const goalDirectory = join(directory, "goals");
        const trajectoryDirectory = join(directory, "trajectories");
        const traceDirectory = join(directory, "traces");
        const bindings: BenchmarkPersistenceBindings = {
            goalStore: new JsonFileGoalStore(goalDirectory),
            trajectoryStore: new JsonFileTrajectoryStore(trajectoryDirectory),
            locator: {
                goalSnapshot: goalDirectory,
                trajectory: trajectoryDirectory,
                ...(this.enableTrace ? { diagnosticTrace: traceDirectory } : {}),
            },
            ...(this.enableTrace
                ? { traceSink: new JsonFileDiagnosticTraceSink(traceDirectory) }
                : {}),
        };
        return bindings;
    }
}

function encodeIdentifier(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

function assertIdentifier(value: string, field: string): void {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError(`${field} must be non-empty text`);
    }
}
