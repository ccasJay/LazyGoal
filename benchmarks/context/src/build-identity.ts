import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
/** 当前进程加载时的宿主评测源码身份；后续磁盘编辑不改变该进程的记录。 */
export const CONTEXT_HOST_BUILD = Object.freeze({
    sourceDigest: createHash("sha256").update(JSON.stringify(
        readdirSync(new URL("./", import.meta.url)).filter(name => name.endsWith(".ts")).sort().map(name =>
            [name, createHash("sha256").update(readFileSync(new URL(name, import.meta.url))).digest("hex")]),
    )).digest("hex"),
});
