import assert from "node:assert/strict";
import {
    appendFile,
    mkdir,
    mkdtemp,
    open,
    readFile,
    readdir,
    rename,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    appendFileChunk,
    appendJsonl,
    atomicWriteJson,
    type FileWriteOperations,
} from "../src/json-file-write";

async function withDirectory(
    callback: (directory: string) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-json-file-write-"));

    try {
        await callback(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

function temporaryFiles(names: readonly string[]): string[] {
    return names.filter((name) => name.endsWith(".tmp"));
}

function fileError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`injected ${code}`), { code });
}

test("atomicWriteJson writes 0600 files under 0700 directories with the declared byte shape", async () => {
    await withDirectory(async (directory) => {
        const parent = join(directory, "nested", "goals");
        const path = join(parent, "snapshot.json");
        const value = { version: 1, name: "goal", nested: { ok: true } };

        await atomicWriteJson({
            path,
            value,
            indent: 2,
            trailingNewline: true,
            durable: true,
        });

        assert.equal(await readFile(path, "utf8"), `${JSON.stringify(value, null, 2)}\n`);
        assert.equal((await stat(parent)).mode & 0o777, 0o700);
        assert.equal((await stat(path)).mode & 0o777, 0o600);
        assert.deepEqual(temporaryFiles(await readdir(parent)), []);

        const compactPath = join(parent, "compact.json");

        await atomicWriteJson({
            path: compactPath,
            value,
            indent: undefined,
            trailingNewline: false,
            durable: false,
        });

        assert.equal(await readFile(compactPath, "utf8"), JSON.stringify(value));
        assert.equal((await stat(compactPath)).mode & 0o777, 0o600);
    });
});

test("atomicWriteJson syncs the temporary file before rename only when durable", async () => {
    await withDirectory(async (directory) => {
        const durableEvents: string[] = [];
        const durableOperations: Partial<FileWriteOperations> = {
            open: async (path, flags, mode) => {
                const handle = await open(path, flags, mode);
                const sync = handle.sync.bind(handle);
                Object.defineProperty(handle, "sync", {
                    configurable: true,
                    value: async () => {
                        durableEvents.push("sync");
                        await sync();
                    },
                });
                return handle;
            },
            rename: async (from, to) => {
                durableEvents.push("rename");
                await rename(from, to);
            },
        };

        await atomicWriteJson({
            path: join(directory, "durable.json"),
            value: { durable: true },
            indent: 2,
            trailingNewline: true,
            durable: true,
            operations: durableOperations,
        });

        assert.deepEqual(durableEvents, ["sync", "rename"]);

        const volatileEvents: string[] = [];
        const volatileOperations: Partial<FileWriteOperations> = {
            open: async (path, flags, mode) => {
                const handle = await open(path, flags, mode);
                const sync = handle.sync.bind(handle);
                Object.defineProperty(handle, "sync", {
                    configurable: true,
                    value: async () => {
                        volatileEvents.push("sync");
                        await sync();
                    },
                });
                return handle;
            },
            rename: async (from, to) => {
                volatileEvents.push("rename");
                await rename(from, to);
            },
        };

        await atomicWriteJson({
            path: join(directory, "volatile.json"),
            value: { durable: false },
            indent: 2,
            trailingNewline: true,
            durable: false,
            operations: volatileOperations,
        });

        assert.deepEqual(volatileEvents, ["rename"]);
    });
});

test("atomicWriteJson treats an already-applied target as success without rewriting", async () => {
    await withDirectory(async (directory) => {
        const path = join(directory, "applied.json");
        const value = { applied: true };
        const serialized = `${JSON.stringify(value, null, 2)}\n`;
        await writeFile(path, serialized, "utf8");

        let openCalls = 0;
        let renameCalls = 0;
        let verificationCalls = 0;

        await atomicWriteJson({
            path,
            value,
            indent: 2,
            trailingNewline: true,
            durable: true,
            retry: { attempts: 3, delayMs: 0, codes: new Set(["EINTR"]) },
            verify: async (expected) => {
                verificationCalls += 1;
                return await readFile(path, "utf8") === expected ? "applied" : "absent";
            },
            operations: {
                open: async () => {
                    openCalls += 1;
                    throw fileError("EINTR");
                },
                rename: async (from, to) => {
                    renameCalls += 1;
                    await rename(from, to);
                },
            },
        });

        assert.equal(openCalls, 1);
        assert.equal(renameCalls, 0);
        assert.equal(verificationCalls, 1);
        assert.equal(await readFile(path, "utf8"), serialized);
        assert.deepEqual(temporaryFiles(await readdir(directory)), []);
    });
});

test("atomicWriteJson retries only confirmed-absent temporary failures and caps attempts", async () => {
    await withDirectory(async (directory) => {
        const path = join(directory, "retry.json");
        let openCalls = 0;
        let verificationCalls = 0;

        await atomicWriteJson({
            path,
            value: { attempt: 1 },
            indent: 2,
            trailingNewline: true,
            durable: true,
            retry: { attempts: 3, delayMs: 0, codes: new Set(["EINTR"]) },
            verify: async () => {
                verificationCalls += 1;
                return "absent";
            },
            operations: {
                open: async (target, flags, mode) => {
                    openCalls += 1;
                    if (openCalls === 1) throw fileError("EINTR");
                    return await open(target, flags, mode);
                },
            },
        });

        assert.equal(openCalls, 2);
        assert.equal(verificationCalls, 1);
        assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { attempt: 1 });

        const exhaustedPath = join(directory, "exhausted.json");
        let attempts = 0;
        let exhaustedVerifications = 0;

        await assert.rejects(
            atomicWriteJson({
                path: exhaustedPath,
                value: { attempt: 2 },
                indent: 2,
                trailingNewline: true,
                durable: true,
                retry: { attempts: 3, delayMs: 0, codes: new Set(["EBUSY"]) },
                verify: async () => {
                    exhaustedVerifications += 1;
                    return "absent";
                },
                operations: {
                    open: async () => {
                        attempts += 1;
                        throw fileError("EBUSY");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "EBUSY",
        );

        assert.equal(attempts, 3);
        assert.equal(exhaustedVerifications, 3);
        assert.deepEqual(temporaryFiles(await readdir(directory)), []);
    });
});

test("atomicWriteJson propagates verification errors and cleans the temporary file", async () => {
    await withDirectory(async (directory) => {
        const targetDirectory = join(directory, "verified");
        await mkdir(targetDirectory, { recursive: true });
        const protocolError = new Error("snapshot verification failed");

        await assert.rejects(
            atomicWriteJson({
                path: join(targetDirectory, "goal.json"),
                value: { version: 1 },
                indent: 2,
                trailingNewline: true,
                durable: true,
                retry: { attempts: 3, delayMs: 0, codes: new Set(["EBUSY"]) },
                verify: async () => {
                    throw protocolError;
                },
                operations: {
                    open: async (path, flags, mode) => {
                        await open(path, flags, mode);
                        throw fileError("EBUSY");
                    },
                },
            }),
            (error: unknown) => error === protocolError,
        );

        assert.deepEqual(temporaryFiles(await readdir(targetDirectory)), []);
    });
});

test("atomicWriteJson propagates the original write error when temporary cleanup fails", async () => {
    await withDirectory(async (directory) => {
        const targetDirectory = join(directory, "cleanup");
        await mkdir(targetDirectory, { recursive: true });

        await assert.rejects(
            atomicWriteJson({
                path: join(targetDirectory, "goal.json"),
                value: { version: 1 },
                indent: 2,
                trailingNewline: true,
                durable: true,
                operations: {
                    open: async (path, flags, mode) => {
                        await open(path, flags, mode);
                        throw fileError("EACCES");
                    },
                    unlink: async () => {
                        throw fileError("EACCES");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "EACCES" && error instanceof Error
                && error.message === "injected EACCES",
        );

        // 清理失败被隔离在临时文件上，目标文件未被创建。
        await assert.rejects(readFile(join(targetDirectory, "goal.json"), "utf8"), (error: unknown) =>
            fileErrno(error) === "ENOENT");
        assert.equal(temporaryFiles(await readdir(targetDirectory)).length, 1);
    });
});

test("atomicWriteJson keeps ENOENT stage semantics explicit", async () => {
    await withDirectory(async (directory) => {
        const targetDirectory = join(directory, "stages");
        const path = join(targetDirectory, "goal.json");
        const value = { version: 1 };

        await assert.rejects(
            atomicWriteJson({
                path,
                value,
                indent: 2,
                trailingNewline: true,
                durable: true,
                tolerateRenameEnoent: true,
                operations: {
                    mkdir: async () => {
                        throw fileError("ENOENT");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "ENOENT",
        );

        await assert.rejects(
            atomicWriteJson({
                path,
                value,
                indent: 2,
                trailingNewline: true,
                durable: true,
                tolerateRenameEnoent: true,
                operations: {
                    open: async () => {
                        throw fileError("ENOENT");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "ENOENT",
        );

        await atomicWriteJson({
            path,
            value,
            indent: 2,
            trailingNewline: true,
            durable: true,
            tolerateRenameEnoent: true,
            operations: {
                rename: async () => {
                    throw fileError("ENOENT");
                },
            },
        });

        assert.deepEqual(temporaryFiles(await readdir(targetDirectory)), []);

        await assert.rejects(
            atomicWriteJson({
                path,
                value,
                indent: 2,
                trailingNewline: true,
                durable: true,
                operations: {
                    rename: async () => {
                        throw fileError("ENOENT");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "ENOENT",
        );

        await assert.rejects(
            atomicWriteJson({
                path,
                value,
                indent: 2,
                trailingNewline: true,
                durable: true,
                tolerateRenameEnoent: true,
                operations: {
                    rename: async () => {
                        throw fileError("EACCES");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "EACCES",
        );

        assert.deepEqual(temporaryFiles(await readdir(targetDirectory)), []);
    });
});

function fileErrno(error: unknown): string | undefined {
    return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

test("appendJsonl writes exactly one newline-terminated record per call", async () => {
    await withDirectory(async (directory) => {
        const path = join(directory, "events.jsonl");

        await appendJsonl({ path, value: { first: 1 }, durable: false });
        await appendJsonl({ path, value: { second: 2 }, durable: true });

        assert.equal(
            await readFile(path, "utf8"),
            `${JSON.stringify({ first: 1 })}\n${JSON.stringify({ second: 2 })}\n`,
        );
        assert.equal((await stat(path)).mode & 0o777, 0o600);
    });
});

test("appendJsonl uses verification to decide retry and treats an applied line as success", async () => {
    await withDirectory(async (directory) => {
        const retriedPath = join(directory, "retried.jsonl");
        let attempts = 0;
        let verifications = 0;

        await appendJsonl({
            path: retriedPath,
            value: { attempt: 1 },
            durable: false,
            retry: { attempts: 3, delayMs: 0, codes: new Set(["EBUSY"]) },
            verify: async () => {
                verifications += 1;
                return "absent";
            },
            operations: {
                appendFile: async (path, data, options) => {
                    attempts += 1;
                    if (attempts === 1) throw fileError("EBUSY");
                    await appendFile(path, data, options);
                },
            },
        });

        assert.equal(attempts, 2);
        assert.equal(verifications, 1);
        assert.equal(await readFile(retriedPath, "utf8"), `${JSON.stringify({ attempt: 1 })}\n`);

        const appliedPath = join(directory, "applied.jsonl");
        let appliedAttempts = 0;

        await appendJsonl({
            path: appliedPath,
            value: { attempt: 2 },
            durable: false,
            retry: { attempts: 3, delayMs: 0, codes: new Set(["EAGAIN"]) },
            verify: async (line) => await readFile(appliedPath, "utf8").then(
                (content) => content.endsWith(line) ? "applied" : "absent",
            ),
            operations: {
                appendFile: async (path, data, options) => {
                    appliedAttempts += 1;
                    await appendFile(path, data, options);
                    if (appliedAttempts === 1) throw fileError("EAGAIN");
                },
            },
        });

        assert.equal(appliedAttempts, 1);
        assert.equal(await readFile(appliedPath, "utf8"), `${JSON.stringify({ attempt: 2 })}\n`);
    });
});

test("appendJsonl never retries without verification or on non-retryable errors", async () => {
    await withDirectory(async (directory) => {
        let blindAttempts = 0;

        await assert.rejects(
            appendJsonl({
                path: join(directory, "blind.jsonl"),
                value: { blind: true },
                durable: false,
                retry: { attempts: 3, delayMs: 0, codes: new Set(["EBUSY"]) },
                operations: {
                    appendFile: async () => {
                        blindAttempts += 1;
                        throw fileError("EBUSY");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "EBUSY",
        );
        assert.equal(blindAttempts, 1);

        let deniedAttempts = 0;
        let deniedVerifications = 0;

        await assert.rejects(
            appendJsonl({
                path: join(directory, "denied.jsonl"),
                value: { denied: true },
                durable: false,
                retry: { attempts: 3, delayMs: 0, codes: new Set(["EBUSY"]) },
                verify: async () => {
                    deniedVerifications += 1;
                    return "absent";
                },
                operations: {
                    appendFile: async () => {
                        deniedAttempts += 1;
                        throw fileError("EACCES");
                    },
                },
            }),
            (error: unknown) => fileErrno(error) === "EACCES",
        );
        assert.equal(deniedAttempts, 1);
        assert.equal(deniedVerifications, 0);
    });
});

test("appendJsonl stops on a verification protocol error without truncating the file", async () => {
    await withDirectory(async (directory) => {
        const path = join(directory, "partial.jsonl");
        const protocolError = new Error("incomplete JSONL tail");

        await assert.rejects(
            appendJsonl({
                path,
                value: { partial: true },
                durable: false,
                retry: { attempts: 3, delayMs: 0, codes: new Set(["EBUSY"]) },
                verify: async () => {
                    throw protocolError;
                },
                operations: {
                    appendFile: async (path, data, options) => {
                        if (typeof data !== "string") throw new Error("Expected a JSONL string write");
                        await appendFile(path, data.slice(0, -3), options);
                        throw fileError("EBUSY");
                    },
                },
            }),
            (error: unknown) => error === protocolError,
        );

        assert.equal(
            await readFile(path, "utf8"),
            `${JSON.stringify({ partial: true })}\n`.slice(0, -3),
        );
    });
});

test("appendFileChunk appends raw bytes and syncs only when durable", async () => {
    await withDirectory(async (directory) => {
        const path = join(directory, "part-0.log");

        await appendFileChunk({ path, data: Buffer.from("ab"), durable: false });
        await appendFileChunk({ path, data: "cd", durable: true });

        assert.equal((await readFile(path)).toString("utf8"), "abcd");
        assert.equal((await stat(path)).mode & 0o777, 0o600);

        const events: string[] = [];

        await appendFileChunk({
            path: join(directory, "durable.log"),
            data: "x",
            durable: true,
            operations: {
                open: async (path, flags, mode) => {
                    const handle = await open(path, flags, mode);
                    const sync = handle.sync.bind(handle);
                    Object.defineProperty(handle, "sync", {
                        configurable: true,
                        value: async () => {
                            events.push("sync");
                            await sync();
                        },
                    });
                    return handle;
                },
            },
        });

        assert.deepEqual(events, ["sync"]);
    });
});
