import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

/**
 * 删除切换前旧布局的本地 Goal 与专属记录。
 *
 * @remarks
 * 旧布局把 Goal 快照写成 `goals/<id>.json`，并把轨迹、Trace、指标、Context Sidecar
 * 与模型输入分别放在工作区顶层的独立目录。新布局只使用 `goals/<id>/`，因此这些
 * 位置在没有存量数据时是噪音，在有存量数据时无法被新代码读取。
 *
 * 清理只删除能被识别为旧布局的 Goal 专属内容：
 * - `goals/` 下的普通 `*.json` 快照与 `*.json.archived` 标记；
 * - `goals/catalog/` 派生摘要目录；
 * - 已退役的 `trajectories/`、`traces/`、`metrics/`、`context-sidecars/` 与
 *   `model-inputs/` 目录。
 *
 * 工作区共享数据（`workspace.json`、`sandbox-grants.json`、`permission-profile.json`、
 * `model-preference.json`、`processes/`、`benchmarks/`、`gepa/`）与 `goals/` 下的新布局
 * Goal 目录都保留。默认只输出审计结果；只有 `--apply` 才真正删除。
 *
 * @example
 * ```sh
 * npx tsx scripts/reset-legacy-goal-layout.ts --workspace ~/.lazygoal/workspaces/<id>
 * npx tsx scripts/reset-legacy-goal-layout.ts --workspace <dir> --apply
 * ```
 */
async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            workspace: { type: "string" },
            apply: { type: "boolean", default: false },
        },
    });

    if (values.workspace === undefined) {
        console.error("Usage: reset-legacy-goal-layout --workspace <workspace-directory> [--apply]");
        process.exitCode = 1;
        return;
    }

    const workspace = resolve(values.workspace);
    const goalsDirectory = join(workspace, "goals");
    const targets: string[] = [];
    const legacyGoalIds: string[] = [];

    for (const name of await readDirectoryNames(goalsDirectory)) {
        if (name.endsWith(".json") || name.endsWith(".json.archived")) {
            targets.push(join(goalsDirectory, name));
            const encoded = name.endsWith(".json.archived")
                ? name.slice(0, -".json.archived".length)
                : name.slice(0, -".json".length);
            const goalId = decodePathSegment(encoded);
            if (goalId !== undefined) legacyGoalIds.push(goalId);
        }
    }

    const catalogDirectory = join(goalsDirectory, "catalog");
    if (await isDirectory(catalogDirectory)) targets.push(catalogDirectory);

    for (const name of ["trajectories", "traces", "metrics", "context-sidecars", "model-inputs"]) {
        const directory = join(workspace, name);
        if (await isDirectory(directory)) targets.push(directory);
    }

    // 旧布局 Goal 的进程会话仍按 Goal 目录留在 `processes/`，随该 Goal 一并清理。
    const processSessions = join(workspace, "processes");
    for (const goalId of new Set(legacyGoalIds)) {
        const directory = join(processSessions, encodePathSegment(goalId));
        if (await isDirectory(directory)) targets.push(directory);
    }

    for (const target of targets) console.log(`[legacy] ${target}`);
    for (const goalId of new Set(legacyGoalIds)) {
        console.log(`[legacy-goal] ${goalId}`);
    }

    if (targets.length === 0) {
        console.log("No legacy layout data found.");
        return;
    }

    if (!values.apply) {
        console.log("Dry run only; pass --apply to delete the listed legacy paths.");
        return;
    }

    for (const target of targets) {
        await rm(target, { recursive: true, force: true });
        console.log(`[deleted] ${target}`);
    }
}

async function readDirectoryNames(directory: string): Promise<string[]> {
    try {
        return await readdir(directory);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

function decodePathSegment(encoded: string): string | undefined {
    const value = Buffer.from(encoded, "base64url").toString("utf8");
    return encodePathSegment(value) === encoded ? value : undefined;
}

function encodePathSegment(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

await main();
