import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WorkerProgress } from "./worker-process";

/**
 * 可重新认证 Worker 进程所需的私有注册信息。
 *
 * @remarks
 * `secret` 只允许保存在权限受限的 Worker 注册文件中，并通过子进程环境传给对应
 * Worker。PID 仅用于观察，不参与身份认证；重新接管必须通过 Unix socket 挑战握手。
 *
 * @example
 * ```ts
 * const registration = await createWorkerProcessRegistration(dataDirectory, workerId, generation);
 * ```
 */
export interface WorkerProcessRegistration {
    readonly workerId: string;
    readonly generation: string;
    readonly socketPath: string;
    readonly journalPath: string;
    readonly secret: string;
    readonly cwd: string;
    readonly workspaceIdentityRoot: string;
    readonly projectRoot: string;
    readonly executionRoot: string;
}

/**
 * Worker 在本地登记的未确认进度消息。
 *
 * @remarks
 * 只有 Supervisor 将该进度及 Goal 队列状态持久化后，才会通过消息身份确认并从
 * Worker outbox 中删除。
 *
 * @example
 * ```ts
 * const event: WorkerOfflineProgress = { requestId: "request-1", goalId: "goal-1", result };
 * ```
 */
export interface WorkerOfflineProgress {
    readonly requestId: string;
    readonly goalId: string;
    readonly result: WorkerProgress;
    readonly kind: "advance-result" | "permission-result" | "cancel-result";
}

function registryDirectory(dataDirectory: string): string {
    return join(dataDirectory, "worker-processes");
}

function registrationFile(dataDirectory: string, workerId: string): string {
    return join(registryDirectory(dataDirectory), `${createHash("sha256").update(workerId).digest("hex")}.json`);
}

function socketFor(dataDirectory: string, workerId: string): string {
    const digest = createHash("sha256").update(`${resolve(dataDirectory)}\0${workerId}`).digest("hex").slice(0, 32);
    return join(tmpdir(), `lgw-${digest}.sock`);
}

/**
 * 为新 Worker 创建可恢复的本机通道登记。
 *
 * @param dataDirectory - 当前 LazyGoal 数据目录。
 * @param workerId - 新 Worker 的稳定逻辑身份。
 * @param generation - 此 OS 进程代次。
 * @param workspace - 已授权的项目与执行工作区。
 * @returns 已以私有权限持久化的注册信息。
 * @throws 身份冲突或文件系统写入失败时抛出。
 */
export async function createWorkerProcessRegistration(
    dataDirectory: string,
    workerId: string,
    generation: string,
    workspace: { readonly projectRoot: string; readonly executionRoot: string },
): Promise<WorkerProcessRegistration> {
    if (!workerId.trim() || !generation.trim()) throw new Error("Worker identity is required");
    const directory = registryDirectory(dataDirectory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const registration: WorkerProcessRegistration = {
        workerId,
        generation,
        socketPath: socketFor(dataDirectory, workerId),
        journalPath: join(directory, `${createHash("sha256").update(workerId).digest("hex")}.journal.json`),
        secret: randomBytes(32).toString("hex"),
        cwd: workspace.executionRoot,
        workspaceIdentityRoot: workspace.projectRoot,
        projectRoot: workspace.projectRoot,
        executionRoot: workspace.executionRoot,
    };
    const path = registrationFile(dataDirectory, workerId);
    const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(temporary, JSON.stringify(registration), { mode: 0o600, flag: "wx" });
    try {
        await rename(temporary, path);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
    return registration;
}

/**
 * 列出格式有效的 Worker 注册记录，供 Supervisor 恢复扫描。
 *
 * @param dataDirectory - 当前 LazyGoal 数据目录。
 * @returns 已持久化的注册记录；单个损坏文件会被忽略，不影响其他记录。
 */
export async function listWorkerProcessRegistrations(dataDirectory: string): Promise<readonly WorkerProcessRegistration[]> {
    const directory = registryDirectory(dataDirectory);
    let names: string[];
    try { names = await readdir(directory); } catch (error) {
        if (isMissing(error)) return [];
        throw error;
    }
    const records: WorkerProcessRegistration[] = [];
    for (const name of names.filter((item) => item.endsWith(".json") && !item.endsWith(".journal.json")).sort()) {
        try {
            const parsed: unknown = JSON.parse(await readFile(join(directory, name), "utf8"));
            if (!isRegistration(parsed)) continue;
            records.push(parsed);
        } catch {
            // Corrupt registrations cannot authenticate a process and are not recovery evidence.
        }
    }
    return records;
}

/**
 * 删除已确认正常关闭的 Worker 注册信息。
 *
 * @param dataDirectory - 当前 LazyGoal 数据目录。
 * @param workerId - 已关闭 Worker 的逻辑身份。
 */
export async function removeWorkerProcessRegistration(dataDirectory: string, workerId: string): Promise<void> {
    const digest = createHash("sha256").update(workerId).digest("hex");
    const directory = registryDirectory(dataDirectory);
    await Promise.all([
        rm(join(directory, `${digest}.json`), { force: true }),
        rm(join(directory, `${digest}.journal.json`), { force: true }),
    ]);
}

/**
 * 删除已确证退出 Worker 的可连接注册文件，保留其离线日志供后续审计。
 *
 * @param dataDirectory - 当前 LazyGoal 数据目录。
 * @param workerId - 已确证退出的 Worker 身份。
 * @throws 文件系统删除失败时抛出。
 */
export async function removeWorkerRegistration(dataDirectory: string, workerId: string): Promise<void> {
    const digest = createHash("sha256").update(workerId).digest("hex");
    await rm(join(registryDirectory(dataDirectory), `${digest}.json`), { force: true });
}

function isRegistration(value: unknown): value is WorkerProcessRegistration {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    return ["workerId", "generation", "socketPath", "journalPath", "secret", "cwd", "workspaceIdentityRoot", "projectRoot", "executionRoot"]
        .every((key) => typeof item[key] === "string" && (item[key] as string).trim().length > 0);
}

function isMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
