import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
/** 当前进程加载时的宿主评测源码身份；后续磁盘编辑不改变该进程的记录。 */
export const CONTEXT_HOST_BUILD = Object.freeze({
    sourceDigest: createHash("sha256").update(JSON.stringify(
        readdirSync(new URL("./", import.meta.url)).filter(name => name.endsWith(".ts")).sort().map(name =>
            [name, createHash("sha256").update(readFileSync(new URL(name, import.meta.url))).digest("hex")]),
    )).digest("hex"),
});

/** 共享宿主评测层的加载时身份；具体来源另外由注入端口提供身份。 */
export const CONTEXT_SHARED_BUILD = Object.freeze({
    sourceDigest: createHash("sha256").update(JSON.stringify(
        readdirSync(new URL("../../src/", import.meta.url)).filter(name => name.endsWith(".ts")).sort().map(name =>
            [name, createHash("sha256").update(readFileSync(new URL("../../src/" + name, import.meta.url))).digest("hex")]),
    )).digest("hex"),
});
