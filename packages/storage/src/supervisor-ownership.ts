import { closeSync, openSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * 由内核文件锁维持的单机 Supervisor 所有权。
 *
 * @remarks
 * 对同一私有存储目录，所有 Supervisor 必须使用同一个锁数据库路径。锁由 SQLite
 * 独占事务持有，进程退出后由操作系统释放，不通过 PID 或超时推断退出。
 * `close` 拒绝新操作并等待已借用的操作完成后释放锁。此锁不验证 Worker 身份，
 * 也不阻止绕过此对象直接访问存储的调用方。
 *
 * @example
 * ```ts
 * const owner = new SupervisorOwnership("/private/supervisor.lock.db");
 * await owner.run(async () => updateOwnedState());
 * await owner.close();
 * ```
 */
export class SupervisorOwnership {
    private readonly database: DatabaseSync;
    private active = 0;
    private readonly sequences = new Map<string, Promise<void>>();
    private closing = false;
    private closePromise: Promise<void> | undefined;
    private resolveClose: (() => void) | undefined;

    /**
     * @param path - 稳定锁数据库路径，父目录必须已存在。
     * @throws 其他所有者持锁、数据库损坏或文件系统失败时抛出。
     */
    constructor(path: string) {
        if (path === ":memory:") throw new Error("Supervisor ownership requires a shared file");
        closeSync(openSync(path, "a", 0o600));
        const db = new DatabaseSync(path);
        try {
            db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
        } catch (error) {
            db.close();
            throw error;
        }
        this.database = db;
    }

    /**
     * 在持锁期间执行操作，所有权释放等待该操作结束。
     * @param operation - 更新或派发受 Supervisor 所有的状态。
     * @returns 操作的结果。
     * @throws 所有权正在释放或操作失败时抛出。
     */
    async run<T>(operation: () => Promise<T>): Promise<T> {
        if (this.closing) throw new Error("Supervisor ownership is closed");
        this.active++;
        try { return await operation(); } finally {
            this.active--;
            if (this.active === 0) this.resolveClose?.();
        }
    }

    /**
     * 在持锁期间按身份串行执行操作，不同身份可以并发。
     * @param key - 需要互斥的稳定身份。
     * @param operation - 在同一身份的前序操作结束后执行。
     * @returns 操作的结果；前序失败不会阻塞后序操作。
     * @throws 所有权关闭或操作失败时抛出。
     */
    async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
        return this.run(async () => {
            const previous = this.sequences.get(key);
            let release!: () => void;
            const current = new Promise<void>((resolve) => { release = resolve; });
            this.sequences.set(key, current);
            try {
                await previous;
                return await operation();
            } finally {
                if (this.sequences.get(key) === current) this.sequences.delete(key);
                release();
            }
        });
    }

    /** 拒绝新操作，等待已有操作结束并释放内核锁。 */
    close(): Promise<void> {
        if (this.closePromise !== undefined) return this.closePromise;
        this.closing = true;
        this.closePromise = (async () => {
            if (this.active !== 0) await new Promise<void>((resolve) => { this.resolveClose = resolve; });
            this.database.close();
        })();
        return this.closePromise;
    }
}
