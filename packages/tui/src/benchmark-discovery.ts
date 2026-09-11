import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalStore,
    RunStatus,
} from "../../runtime/src/index";
import { JsonFileGoalStore } from "../../storage/src/index";

/**
 * 携带物理存储目录定位的 Benchmark Goal 摘要条目。
 *
 * @remarks
 * 扩展标准 {@link GoalCatalogEntry}，附加 `benchmarkId`、`taskId` 与物理所在目录
 * `goalDirectory`，以便在用户选中或执行 inspect 时无需遍历即可快速恢复。
 *
 * @example
 * ```ts
 * const entry: BenchmarkGoalCatalogEntry = {
 *     goalId: "gaia-smoke-1",
 *     runId: "run-1",
 *     intent: "[GAIA] gaia-smoke-001",
 *     workflowPhase: "executing",
 *     runStatus: "completed",
 *     updatedAt: "2026-09-11T17:53:00.000Z",
 *     goalDirectory: "/path/to/runtime/.../goals",
 * };
 * ```
 */
export interface BenchmarkGoalCatalogEntry extends GoalCatalogEntry {
    /** 评测基准标识（如 gaia、swebench、alfworld）。 */
    readonly benchmarkId?: string;
    /** 具体任务标识（如 gaia-smoke-001、astropy__astropy-12907）。 */
    readonly taskId?: string;
    /** 包含该 Goal 快照的真实底层 goals 目录绝对路径。 */
    readonly goalDirectory: string;
}

/**
 * 将 Benchmark 标识转换为人类可读的标准展示标签。
 *
 * @param benchmarkId - 评测标识原始字符串。
 * @returns 规范化的方括号标签，如 `[GAIA]`、`[SWE-bench]`。
 */
export function formatBenchmarkTag(benchmarkId?: string): string {
    if (!benchmarkId) {
        return "[Benchmark]";
    }
    const lower = benchmarkId.toLowerCase();
    if (lower.includes("gaia")) {
        return "[GAIA]";
    }
    if (lower.includes("swebench") || lower.includes("swe-bench")) {
        return "[SWE-bench]";
    }
    if (lower.includes("alfworld")) {
        return "[ALFWorld]";
    }
    return `[${benchmarkId.toUpperCase()}]`;
}

/**
 * 安全尝试对 base64url 编码的目录片段进行解码。
 *
 * @param segment - 待解码的目录名。
 * @returns 成功解码出的可读 ASCII 字符串；若不合法则原样返回。
 */
function tryDecodeBase64Url(segment: string): string {
    try {
        const decoded = Buffer.from(segment, "base64url").toString("utf8");
        return /^[\x20-\x7E]+$/.test(decoded) ? decoded : segment;
    } catch {
        return segment;
    }
}

/**
 * 递归扫描指定目录，搜寻所有的 goals 目录与 attempt 记录。
 *
 * @param benchmarksRoot - 评测输出根目录路径。
 * @returns 发现的所有 Benchmark Goal 摘要条目。
 *
 * @example
 * ```ts
 * const entries = await discoverBenchmarkGoals(".lazygoal/benchmarks");
 * ```
 */
export async function discoverBenchmarkGoals(
    benchmarksRoot: string,
): Promise<BenchmarkGoalCatalogEntry[]> {
    const results: BenchmarkGoalCatalogEntry[] = [];
    const discoveredGoalIds = new Set<string>();

    async function walk(dir: string, depth = 0): Promise<void> {
        if (depth > 8) {
            return;
        }
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (!entry.isDirectory()) {
                continue;
            }

            if (entry.name === "attempts") {
                await processAttemptsDirectory(fullPath);
            } else if (entry.name === "goals") {
                await processGoalsDirectory(fullPath);
            } else if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
                await walk(fullPath, depth + 1);
            }
        }
    }

    async function processAttemptsDirectory(attemptsDir: string): Promise<void> {
        let taskDirs;
        try {
            taskDirs = await readdir(attemptsDir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const taskDir of taskDirs) {
            if (!taskDir.isDirectory()) {
                continue;
            }
            const taskPath = join(attemptsDir, taskDir.name);
            let attemptFiles;
            try {
                attemptFiles = await readdir(taskPath, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const file of attemptFiles) {
                if (!file.isFile() || !file.name.endsWith(".json")) {
                    continue;
                }
                const attemptPath = join(taskPath, file.name);
                try {
                    const content = await readFile(attemptPath, "utf8");
                    const data = JSON.parse(content);
                    if (!data.goalId) {
                        continue;
                    }
                    if (discoveredGoalIds.has(data.goalId)) {
                        continue;
                    }

                    const rootDir = dirname(attemptsDir);
                    const goalSnapshotSubdir = data.artifactLocator?.goalSnapshot;
                    const goalDirectory = goalSnapshotSubdir
                        ? join(rootDir, goalSnapshotSubdir)
                        : join(rootDir, "runtime", "goals");

                    const fileStat = await stat(attemptPath);
                    const tag = formatBenchmarkTag(data.benchmarkId);
                    const taskId = data.taskId ?? taskDir.name;
                    const runStatus = (data.status ?? "completed") as RunStatus;

                    discoveredGoalIds.add(data.goalId);
                    results.push({
                        goalId: data.goalId,
                        runId: data.runId ?? `run-${data.goalId}`,
                        intent: `${tag} ${taskId}`,
                        workflowPhase: "executing",
                        runStatus,
                        updatedAt: new Date(fileStat.mtimeMs).toISOString(),
                        ...(data.benchmarkId ? { benchmarkId: data.benchmarkId } : {}),
                        ...(taskId ? { taskId } : {}),
                        goalDirectory,
                    });
                } catch {
                    // 忽略损坏的单个 attempt 记录
                }
            }
        }
    }

    async function processGoalsDirectory(goalsDir: string): Promise<void> {
        let files;
        try {
            files = await readdir(goalsDir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const file of files) {
            if (!file.isFile() || !file.name.endsWith(".json")) {
                continue;
            }
            const filePath = join(goalsDir, file.name);
            try {
                const content = await readFile(filePath, "utf8");
                const data = JSON.parse(content);
                const goalId = data.id;
                if (!goalId || discoveredGoalIds.has(goalId)) {
                    continue;
                }

                const fileStat = await stat(filePath);
                const lowerDir = goalsDir.toLowerCase();

                let benchmarkName = "";
                if (data.definition?.profile?.id?.includes("gaia") || goalId.startsWith("gaia-") || lowerDir.includes("gaia") || lowerDir.includes("z2fpyq")) {
                    benchmarkName = "gaia";
                } else if (data.definition?.profile?.id?.includes("swebench") || lowerDir.includes("swebench") || lowerDir.includes("c3dlymvuy2g")) {
                    benchmarkName = "swebench";
                } else if (data.definition?.profile?.id?.includes("alfworld") || lowerDir.includes("alfworld") || lowerDir.includes("ywxmzhdvygqd")) {
                    benchmarkName = "alfworld";
                }

                const pathParts = goalsDir.split("/");
                const goalsIndex = pathParts.lastIndexOf("goals");
                let candidateTask = "";
                for (let i = goalsIndex - 1; i >= 0; i--) {
                    const part = pathParts[i];
                    if (part === undefined) {
                        continue;
                    }
                    const decoded = tryDecodeBase64Url(part);
                    if (decoded && decoded !== "runtime" && decoded !== "attempts" && decoded !== benchmarkName && !decoded.includes("runs")) {
                        candidateTask = decoded;
                        break;
                    }
                }

                const tag = formatBenchmarkTag(benchmarkName.length > 0 ? benchmarkName : undefined);
                const taskId = candidateTask || data.definition?.intent?.slice(0, 30) || goalId.slice(0, 8);
                const runStatus = (data.state?.run?.status ?? "completed") as RunStatus;
                const workflowPhase = data.state?.workflow?.phase ?? "executing";

                discoveredGoalIds.add(goalId);
                results.push({
                    goalId,
                    runId: data.state?.run?.id ?? `run-${goalId}`,
                    intent: `${tag} ${taskId}`,
                    workflowPhase,
                    runStatus,
                    updatedAt: new Date(fileStat.mtimeMs).toISOString(),
                    ...(benchmarkName.length > 0 ? { benchmarkId: benchmarkName } : {}),
                    ...(taskId ? { taskId } : {}),
                    goalDirectory: goalsDir,
                });
            } catch {
                // 忽略非标准或损坏快照
            }
        }
    }

    await walk(benchmarksRoot);

    results.sort((a, b) => {
        const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (timeDiff !== 0) {
            return timeDiff;
        }
        return a.goalId < b.goalId ? -1 : a.goalId > b.goalId ? 1 : 0;
    });

    return results;
}

/**
 * 聚合主持久化与 Benchmark 目录的聚合 GoalStore 与 GoalCatalog。
 *
 * @remarks
 * 在标准 GoalStore/GoalCatalog 基础上，透明聚合 `.lazygoal/benchmarks/` 下的评测产物；
 * 在调用 `listHistory` 时自动发现评测目标并合并排序，在调用 `restore` 时支持跨目录寻址与解码。
 *
 * @example
 * ```ts
 * const store = new AggregatedGoalStore(primaryStore, ".lazygoal/benchmarks");
 * const allHistory = await store.listHistory();
 * const goal = await store.restore("gaia-smoke-1");
 * ```
 */
export class AggregatedGoalStore implements GoalStore, GoalCatalog {
    private readonly goalDirectoryMap = new Map<string, string>();
    private hasScanned = false;

    /**
     * @param primaryStore - 主工作区的目标存储与目录实例。
     * @param benchmarksRoot - 可选的 Benchmark 评测输出根目录；未指定时仅代理主存储。
     */
    constructor(
        private readonly primaryStore: GoalStore & GoalCatalog,
        private readonly benchmarksRoot?: string,
    ) {}

    /** @inheritdoc */
    async save(goal: Goal): Promise<void> {
        return this.primaryStore.save(goal);
    }

    /** @inheritdoc */
    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return this.primaryStore.listResumable();
    }

    /** @inheritdoc */
    async listHistory(): Promise<readonly GoalCatalogEntry[]> {
        const primaryEntries = this.primaryStore.listHistory
            ? await this.primaryStore.listHistory()
            : await this.primaryStore.listResumable();

        const formattedPrimary: GoalCatalogEntry[] = primaryEntries.map((entry) => ({
            ...entry,
            intent: entry.intent.startsWith("[") ? entry.intent : `[Goal] ${entry.intent}`,
        }));

        if (!this.benchmarksRoot) {
            return formattedPrimary;
        }

        const benchmarkEntries = await discoverBenchmarkGoals(this.benchmarksRoot);
        for (const b of benchmarkEntries) {
            this.goalDirectoryMap.set(b.goalId, b.goalDirectory);
        }
        this.hasScanned = true;

        const merged: GoalCatalogEntry[] = [...formattedPrimary, ...benchmarkEntries];
        merged.sort((a, b) => {
            const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            if (timeDiff !== 0) {
                return timeDiff;
            }
            return a.goalId < b.goalId ? -1 : a.goalId > b.goalId ? 1 : 0;
        });

        return merged;
    }

    /** @inheritdoc */
    async restore(goalId: string): Promise<Goal | undefined> {
        const primaryGoal = await this.primaryStore.restore(goalId);
        if (primaryGoal !== undefined) {
            return primaryGoal;
        }

        if (!this.goalDirectoryMap.has(goalId) && !this.hasScanned && this.benchmarksRoot) {
            const benchmarkEntries = await discoverBenchmarkGoals(this.benchmarksRoot);
            for (const b of benchmarkEntries) {
                this.goalDirectoryMap.set(b.goalId, b.goalDirectory);
            }
            this.hasScanned = true;
        }

        const goalDirectory = this.goalDirectoryMap.get(goalId);
        if (goalDirectory !== undefined) {
            const benchmarkStore = new JsonFileGoalStore(goalDirectory);
            return benchmarkStore.restore(goalId);
        }

        return undefined;
    }
}
