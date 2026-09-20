import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { build, type BuildOptions } from "esbuild";
import { requireSuccess, runProcess, type ProcessRunner } from "./process.js";

/** 固定 Worker 运行时版本；容器内不得通过 npm install 替换。 */
export const WORKER_NODE_VERSION = "22.22.2" as const;
/** 官方 Worker 默认目标平台。 */
export const WORKER_PLATFORM = "linux/amd64" as const;
/** 当前 ACP SDK 依赖版本。 */
export const WORKER_ACP_SDK_VERSION = "1.4.0" as const;
/** 固定的官方 Node linux/amd64 镜像引用。 */
export const WORKER_NODE_IMAGE = "node:22.22.2-bookworm-slim@sha256:868499d55378719bffa87b0ed1f099591823c029b543043c09c2483468e93201" as const;
/** Worker 内嵌 Prompt 资产在 Node 全局对象上的内部入口。 */
export const WORKER_PROMPT_ASSETS_GLOBAL = "__lazygoalPromptAssets" as const;

/** ESM Worker 中为被打包 CommonJS 依赖提供 Node 内置模块的同步 require。 */
const WORKER_NODE_REQUIRE_BANNER = 'import { createRequire as __lazygoalCreateRequire } from "node:module"; const require = __lazygoalCreateRequire(import.meta.url);';

/**
 * 从固定镜像提取后可供 WorkerBuilder 使用的 Node 运行时。
 *
 * @example
 * ```ts
 * const runtime = await extractWorkerNode({ cacheDirectory: ".cache/node" });
 * ```
 */
export interface WorkerNodeRuntime {
    /** 已提取的 Node ELF 文件；调用方负责把它作为不可变输入传入 Builder。 */
    readonly path: string;
    /** Docker inspect 返回的镜像内容 ID。 */
    readonly imageId: string;
}

/**
 * Node 运行时提取器的 Docker 与缓存边界。
 *
 * @example
 * ```ts
 * const options: WorkerNodeExtractorOptions = { cacheDirectory: ".cache/node" };
 * ```
 */
export interface WorkerNodeExtractorOptions {
    /** 提取缓存根目录；只发布完整的 node 文件和摘要。 */
    readonly cacheDirectory: string;
    /** 测试可注入的 Docker 进程边界；默认使用受控 ProcessRunner。 */
    readonly run?: ProcessRunner;
}

/**
 * Worker 产物清单中的可核验身份。
 *
 * @remarks
 * 这些字段描述构建输入和运行时边界；消费者应在启动前将其与实际文件和容器平台比对。
 *
 * @example
 * ```ts
 * const identity: WorkerIdentity = artifact.manifest;
 * console.log(identity.workerSha256, identity.nodeVersion);
 * ```
 */
export interface WorkerIdentity {
    readonly workerSha256: string;
    readonly sourceDigest: string;
    readonly lockDigest: string;
    readonly promptDigest: string;
    readonly buildDigest: string;
    readonly nodeVersion: typeof WORKER_NODE_VERSION;
    readonly nodeImage: string;
    readonly nodeImageId: string;
    readonly platform: typeof WORKER_PLATFORM;
    readonly acpProtocolVersion: 1;
    readonly acpSdkVersion: typeof WORKER_ACP_SDK_VERSION;
}

/**
 * Worker 清单写入磁盘的当前 schema。
 *
 * @example
 * ```ts
 * const manifest = await readWorkerManifest(directory);
 * if (manifest !== undefined) console.log(manifest.workerFile);
 * ```
 */
export interface WorkerManifest extends WorkerIdentity {
    readonly manifestVersion: 1;
    readonly entryPoint: string;
    readonly workerFile: string;
    readonly nodeFile: string;
    readonly nodeSha256: string;
    readonly promptAssets: readonly string[];
}

/**
 * WorkerBuilder 的源码、锁文件和可选 Node 运行时输入。
 *
 * @remarks
 * 所有相对路径均相对于 `projectRoot`；`nodeRuntimePath` 必须来自调用方或默认提取器
 * 验证过的固定 linux/amd64 Node 镜像，Builder 不会在题目容器内安装依赖。
 *
 * @example
 * ```ts
 * const options: WorkerBuilderOptions = {
 *   projectRoot: process.cwd(),
 *   entryPoint: "benchmarks/swebench/src/worker.ts",
 *   cacheDirectory: ".cache/swebench-worker",
 * };
 * ```
 */
export interface WorkerBuilderOptions {
    /** 包含 Worker 入口和依赖源码的仓库根。 */
    readonly projectRoot: string;
    /** 要 bundle 的 ESM 入口。 */
    readonly entryPoint: string;
    /** 内容摘要缓存目录。 */
    readonly cacheDirectory: string;
    /** 参与身份摘要的 lockfile；默认使用仓库和 benchmarks lockfile。 */
    readonly lockFiles?: readonly string[];
    /** 作为 bundle 输入嵌入或由入口读取的 Prompt 资产。 */
    readonly promptAssets?: readonly string[];
    /** 已从固定 Node 镜像提取的 linux/amd64 可执行文件；省略时自动调用 Docker 提取器。 */
    readonly nodeRuntimePath?: string;
    /** Docker inspect 得到的固定 Node 镜像内容 ID；与 `nodeRuntimePath` 必须成对出现。 */
    readonly nodeImageId?: string;
    /** 测试或宿主编排可注入的 Node 提取器；未提供时使用 `extractWorkerNode`。 */
    readonly nodeRuntimeExtractor?: () => Promise<WorkerNodeRuntime>;
    /** esbuild 额外选项；核心 platform/target/format/write 不可覆盖。 */
    readonly esbuild?: Omit<BuildOptions, "entryPoints" | "bundle" | "platform" | "target" | "format" | "write">;
}

/**
 * 已发布且清单完整的 Worker 产物。
 *
 * @example
 * ```ts
 * const artifact = await buildSwebenchWorker(options);
 * console.log(artifact.cacheHit, artifact.manifestPath);
 * ```
 */
export interface WorkerArtifact {
    readonly digest: string;
    readonly directory: string;
    readonly workerPath: string;
    readonly nodePath: string;
    readonly manifestPath: string;
    readonly manifest: WorkerManifest;
    readonly cacheHit: boolean;
}

/**
 * 从固定官方镜像提取 linux/amd64 Node 运行时，并以镜像内容 ID 缓存完整文件。
 *
 * @param options - Docker 进程与提取缓存目录。
 * @returns 可传给 `buildSwebenchWorker` 的 Node 路径和镜像 ID。
 * @throws Docker 拉取、平台校验、复制或原子发布失败时抛出异常；部分容器会在抛出前清理。
 * @example
 * ```ts
 * const runtime = await extractWorkerNode({ cacheDirectory: ".cache/node" });
 * const artifact = await buildSwebenchWorker({ ...options, ...runtime });
 * ```
 */
export async function extractWorkerNode(options: WorkerNodeExtractorOptions): Promise<WorkerNodeRuntime> {
    const run = options.run ?? runProcess;
    const cacheRoot = resolve(options.cacheDirectory);
    await mkdir(cacheRoot, { recursive: true });
    const pullResult = await run("docker", ["pull", "--platform", WORKER_PLATFORM, WORKER_NODE_IMAGE], {
        timeoutMs: 1_200_000,
        maxBytes: 16 * 1024,
        truncate: true,
    });
    let inspected: string[];
    if (pullResult.code === 0) {
        inspected = requireSuccess(await run("docker", ["image", "inspect", "--format", "{{.Id}}\t{{.Os}}\t{{.Architecture}}", WORKER_NODE_IMAGE], {
            timeoutMs: 30_000,
            maxBytes: 16 * 1024,
        }), "Inspect fixed Worker Node image").trim().split("\t");
    } else {
        const localInspect = await run("docker", ["image", "inspect", "--format", "{{.Id}}\t{{.Os}}\t{{.Architecture}}", WORKER_NODE_IMAGE], {
            timeoutMs: 30_000,
            maxBytes: 16 * 1024,
        });
        if (localInspect.code === 0 && localInspect.stdout.trim().length > 0) {
            inspected = localInspect.stdout.trim().split("\t");
        } else {
            requireSuccess(pullResult, "Pull fixed Worker Node image");
            inspected = [];
        }
    }
    const [imageId, operatingSystem, architecture] = inspected;
    if (imageId === undefined || operatingSystem !== "linux" || architecture !== "amd64") {
        throw new Error("Fixed Worker Node image is not linux/amd64");
    }
    const identity = sha256(`${WORKER_NODE_IMAGE}\0${imageId}`);
    const directory = join(cacheRoot, identity);
    const nodePath = join(directory, "node");
    if (await isNodeCacheValid(directory, nodePath, imageId)) return { path: nodePath, imageId };

    const temporary = await mkdtemp(join(cacheRoot, `.node-${identity.slice(0, 12)}-${randomUUID()}-`));
    let containerId: string | undefined;
    try {
        containerId = requireSuccess(await run("docker", ["create", "--platform", WORKER_PLATFORM, WORKER_NODE_IMAGE], {
            timeoutMs: 60_000,
            maxBytes: 16 * 1024,
        }), "Create fixed Worker Node container").trim();
        if (!containerId) throw new Error("Docker returned an empty Worker Node container ID");
        const temporaryNode = join(temporary, "node");
        requireSuccess(await run("docker", ["cp", `${containerId}:/usr/local/bin/node`, temporaryNode], {
            timeoutMs: 60_000,
            maxBytes: 16 * 1024,
        }), "Copy fixed Worker Node binary");
        await chmod(temporaryNode, 0o755);
        await writeFile(join(temporary, "manifest.json"), JSON.stringify({ image: WORKER_NODE_IMAGE, imageId, nodeSha256: sha256(await readFile(temporaryNode)) }) + "\n", "utf8");
        await publishDirectory(temporary, directory, async () => isNodeCacheValid(directory, nodePath, imageId));
        return { path: nodePath, imageId };
    } finally {
        if (containerId !== undefined) {
            await run("docker", ["rm", "--force", containerId], { timeoutMs: 30_000, maxBytes: 16 * 1024, truncate: true }).catch(() => undefined);
        }
        await rm(temporary, { recursive: true, force: true });
    }
}

/**
 * 按源码、锁文件、Prompt 资产和构建参数生成可复现的单文件 ESM Worker。
 *
 * @remarks
 * 摘要目录通过临时目录和原子 rename 发布；并发构建只会看到完整的 Worker 与
 * manifest。缓存命中前会重新校验 Worker 和 Node SHA-256。Node 二进制由调用方或默认
 * Docker 提取器从固定官方 linux/amd64 镜像提供，Builder 不在题目容器安装依赖。Prompt
 * 资产以内嵌 UTF-8/base64 数据写入 `globalThis.__lazygoalPromptAssets`。
 *
 * @param options - Worker 入口、输入摘要、固定 Node 运行时和缓存边界。
 * @returns 已原子发布且 manifest 校验通过的 Worker 与 Node 路径；`cacheHit` 表示是否复用。
 * @throws 输入文件、esbuild、Node 运行时或缓存发布失败时抛出异常；不会返回半成品目录。
 *
 * @example
 * ```ts
 * const artifact = await buildSwebenchWorker({
 *   projectRoot: process.cwd(), entryPoint: "benchmarks/swebench/src/worker.ts",
 *   cacheDirectory: ".cache/swebench-worker",
 * });
 * console.log(artifact.manifest.workerSha256);
 * ```
 */
export async function buildSwebenchWorker(options: WorkerBuilderOptions): Promise<WorkerArtifact> {
    const projectRoot = resolve(options.projectRoot);
    const entryPoint = resolve(projectRoot, options.entryPoint);
    const lockFiles = (options.lockFiles ?? [join(projectRoot, "package-lock.json"), join(projectRoot, "benchmarks", "package-lock.json")])
        .map((path) => resolve(projectRoot, path));
    const promptAssets = (options.promptAssets ?? []).map((path) => resolve(projectRoot, path)).sort();
    const sourceFiles = await discoverSourceFiles(entryPoint);
    const sourceDigest = await digestFiles(projectRoot, sourceFiles);
    const lockDigest = await digestFiles(projectRoot, lockFiles);
    const promptDigest = await digestFiles(projectRoot, promptAssets);
    const nodeRuntime = await resolveNodeRuntime(options);
    const nodeRuntimePath = resolve(nodeRuntime.path);
    const nodeSha256 = sha256(await readFile(nodeRuntimePath));
    const expectedManifest = {
        sourceDigest,
        lockDigest,
        promptDigest,
        nodeImageId: nodeRuntime.imageId,
        nodeSha256,
        entryPoint: relative(projectRoot, entryPoint).split("\\").join("/"),
        promptAssets: promptAssets.map((path) => relative(projectRoot, path).split("\\").join("/")),
    };
    const buildConfig = {
        entryPoint: relative(projectRoot, entryPoint).split("\\").join("/"),
        sourceDigest,
        lockDigest,
        promptDigest,
        promptAssets: promptAssets.map((path) => relative(projectRoot, path).split("\\").join("/")),
        nodeVersion: WORKER_NODE_VERSION,
        nodeImage: WORKER_NODE_IMAGE,
        nodeImageId: nodeRuntime.imageId,
        nodeSha256,
        platform: WORKER_PLATFORM,
        acpSdkVersion: WORKER_ACP_SDK_VERSION,
        nodeRequireBanner: WORKER_NODE_REQUIRE_BANNER,
        esbuild: options.esbuild ?? {},
    };
    const buildDigest = sha256(JSON.stringify(buildConfig));
    const digest = buildDigest;
    const cacheRoot = resolve(options.cacheDirectory);
    await mkdir(cacheRoot, { recursive: true });
    const directory = join(cacheRoot, digest);
    const cached = await readPublishedArtifact(directory, digest, expectedManifest);
    if (cached !== undefined) return { ...cached, cacheHit: true };

    const temporary = await mkdtemp(join(cacheRoot, `.worker-${digest.slice(0, 12)}-${randomUUID()}-`));
    try {
        const promptBanner = await createPromptAssetBanner(projectRoot, promptAssets);
        const existingBanner = options.esbuild?.banner?.js;
        const banner = promptBanner === undefined && existingBanner === undefined
            ? { ...(options.esbuild?.banner ?? {}), js: WORKER_NODE_REQUIRE_BANNER }
            : {
                ...(options.esbuild?.banner ?? {}),
                js: [WORKER_NODE_REQUIRE_BANNER, existingBanner, promptBanner].filter((value): value is string => value !== undefined).join("\n"),
            };
        const result = await build({
            ...(options.esbuild ?? {}),
            entryPoints: [entryPoint],
            bundle: true,
            platform: "node",
            target: "node22",
            format: "esm",
            write: false,
            legalComments: "none",
            metafile: false,
            ...(banner === undefined ? {} : { banner }),
        });
        const contents = result.outputFiles?.[0]?.contents;
        if (contents === undefined) throw new Error("esbuild produced no Worker output");
        const workerSha256 = sha256(contents);
        const workerFile = "worker.mjs";
        const nodeFile = "node";
        await writeFile(join(temporary, workerFile), contents, { mode: 0o755 });
        await writeFile(join(temporary, nodeFile), await readFile(nodeRuntimePath), { mode: 0o755 });
        await chmod(join(temporary, nodeFile), 0o755);
        const manifest: WorkerManifest = {
            manifestVersion: 1,
            workerSha256,
            sourceDigest,
            lockDigest,
            promptDigest,
            buildDigest,
            nodeVersion: WORKER_NODE_VERSION,
            nodeImage: WORKER_NODE_IMAGE,
            nodeImageId: nodeRuntime.imageId,
            platform: WORKER_PLATFORM,
            acpProtocolVersion: 1,
            acpSdkVersion: WORKER_ACP_SDK_VERSION,
            entryPoint: buildConfig.entryPoint,
            workerFile,
            nodeFile,
            nodeSha256,
            promptAssets: buildConfig.promptAssets,
        };
        await writeFile(join(temporary, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
        await publishDirectory(temporary, directory, async () => (await readPublishedArtifact(directory, digest, expectedManifest)) !== undefined);
        const published = await readPublishedArtifact(directory, digest, expectedManifest);
        if (published === undefined) throw new Error("Worker cache publish did not produce a valid artifact");
        return { ...published, cacheHit: false };
    } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw error;
    }
}

/**
 * 为任意 benchmark 构建共享 ACP Worker。
 *
 * @remarks
 * Worker 构建器不包含 benchmark 领域逻辑；入口文件由调用方提供，构建缓存身份
 * 同时包含入口依赖、锁文件、Prompt 资产和固定 Node 运行时。保留
 * `buildSwebenchWorker` 作为现有 SWE-bench 调用方的兼容名称。
 *
 * @param options - Worker 入口、缓存和固定运行时输入。
 * @returns 已校验且原子发布的 Worker 产物。
 * @example
 * ```ts
 * const artifact = await buildBenchmarkWorker({
 *   projectRoot: process.cwd(),
 *   entryPoint: "benchmarks/alfworld/src/worker.ts",
 *   cacheDirectory: ".lazygoal/alfworld-worker-cache",
 * });
 * ```
 */
export async function buildBenchmarkWorker(options: WorkerBuilderOptions): Promise<WorkerArtifact> {
    return buildSwebenchWorker(options);
}

/**
 * 校验并读取已发布的 Worker manifest；不完整或篡改的缓存视为 miss。
 *
 * @param directory - 仅包含一个已发布摘要目录的绝对或相对路径。
 * @returns 所有身份字段和对应文件摘要均通过校验的 manifest；否则返回 `undefined`。
 * @example
 * ```ts
 * const manifest = await readWorkerManifest(artifact.directory);
 * if (manifest === undefined) throw new Error("Worker cache is invalid");
 * ```
 */
export async function readWorkerManifest(directory: string): Promise<WorkerManifest | undefined> {
    try {
        const value: unknown = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
        if (!isWorkerManifest(value)) return undefined;
        const worker = await readFile(join(directory, value.workerFile));
        const node = await readFile(join(directory, value.nodeFile));
        if (sha256(worker) !== value.workerSha256 || sha256(node) !== value.nodeSha256) return undefined;
        return value as unknown as WorkerManifest;
    } catch {
        return undefined;
    }
}

async function readPublishedArtifact(directory: string, digest: string, expected?: Partial<Pick<WorkerManifest, "sourceDigest" | "lockDigest" | "promptDigest" | "nodeImageId" | "nodeSha256" | "entryPoint" | "promptAssets">>): Promise<Omit<WorkerArtifact, "cacheHit"> | undefined> {
    const manifest = await readWorkerManifest(directory);
    if (manifest === undefined || manifest.buildDigest !== digest) return undefined;
    if (expected !== undefined && (manifest.sourceDigest !== expected.sourceDigest
        || manifest.lockDigest !== expected.lockDigest
        || manifest.promptDigest !== expected.promptDigest
        || manifest.nodeImageId !== expected.nodeImageId
        || manifest.nodeSha256 !== expected.nodeSha256
        || manifest.entryPoint !== expected.entryPoint
        || JSON.stringify(manifest.promptAssets) !== JSON.stringify(expected.promptAssets))) return undefined;
    const artifact: Omit<WorkerArtifact, "cacheHit"> = {
        digest,
        directory,
        workerPath: join(directory, manifest.workerFile),
        manifestPath: join(directory, "manifest.json"),
        manifest,
        nodePath: join(directory, manifest.nodeFile),
    };
    return artifact;
}

async function resolveNodeRuntime(options: WorkerBuilderOptions): Promise<WorkerNodeRuntime> {
    const hasPath = options.nodeRuntimePath !== undefined;
    const hasImageId = options.nodeImageId !== undefined;
    if (hasPath !== hasImageId) throw new Error("nodeRuntimePath and nodeImageId must be provided together");
    if (hasPath && hasImageId) {
        if (!/^sha256:[a-f0-9]{64}$/u.test(options.nodeImageId!)) throw new Error("nodeImageId must be a sha256 content ID");
        return { path: options.nodeRuntimePath!, imageId: options.nodeImageId! };
    }
    return options.nodeRuntimeExtractor?.() ?? extractWorkerNode({ cacheDirectory: join(resolve(options.cacheDirectory), ".node-runtime") });
}

async function createPromptAssetBanner(projectRoot: string, assets: readonly string[]): Promise<string | undefined> {
    if (assets.length === 0) return undefined;
    const values: Record<string, string> = {};
    for (const asset of assets) {
        const relativePath = relative(projectRoot, asset).split("\\").join("/");
        const bytes = await readFile(asset);
        const text = bytes.toString("utf8");
        values[relativePath] = Buffer.from(text, "utf8").equals(bytes) ? text : `data:base64,${bytes.toString("base64")}`;
    }
    return `globalThis[${JSON.stringify(WORKER_PROMPT_ASSETS_GLOBAL)}] = Object.freeze(${JSON.stringify(values)});`;
}

async function publishDirectory(temporary: string, directory: string, isPublished: () => Promise<boolean>): Promise<void> {
    try {
        await rename(temporary, directory);
        return;
    } catch (error) {
        if (!isAlreadyExists(error)) throw error;
    }
    if (await isPublished()) {
        await rm(temporary, { recursive: true, force: true });
        return;
    }
    await rm(directory, { recursive: true, force: true });
    try {
        await rename(temporary, directory);
    } catch (error) {
        if (!isAlreadyExists(error) || !(await isPublished())) throw error;
        await rm(temporary, { recursive: true, force: true });
    }
}

async function isRegularFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

async function isNodeCacheValid(directory: string, nodePath: string, imageId: string): Promise<boolean> {
    if (!await isRegularFile(nodePath)) return false;
    try {
        const value: unknown = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
        return isRecord(value)
            && value.image === WORKER_NODE_IMAGE
            && value.imageId === imageId
            && typeof value.nodeSha256 === "string"
            && value.nodeSha256 === sha256(await readFile(nodePath));
    } catch {
        return false;
    }
}

function isWorkerManifest(value: unknown): value is WorkerManifest {
    if (!isRecord(value)
        || value.manifestVersion !== 1
        || !isDigest(value.workerSha256)
        || !isDigest(value.nodeSha256)
        || !isDigest(value.sourceDigest)
        || !isDigest(value.lockDigest)
        || !isDigest(value.promptDigest)
        || !isDigest(value.buildDigest)
        || value.nodeVersion !== WORKER_NODE_VERSION
        || value.nodeImage !== WORKER_NODE_IMAGE
        || typeof value.nodeImageId !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value.nodeImageId)
        || value.platform !== WORKER_PLATFORM
        || value.acpProtocolVersion !== 1
        || value.acpSdkVersion !== WORKER_ACP_SDK_VERSION
        || typeof value.entryPoint !== "string"
        || !isSafeRelativePath(value.workerFile)
        || !isSafeRelativePath(value.nodeFile)
        || !Array.isArray(value.promptAssets)
        || !value.promptAssets.every((asset) => typeof asset === "string" && isSafeRelativePath(asset))) return false;
    return true;
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && !isAbsolute(value) && value !== "."
        && !value.split(/[\\/]+/u).some((part) => part === ".." || part === "");
}

async function discoverSourceFiles(entryPoint: string): Promise<string[]> {
    const visited = new Set<string>();
    const pending = [entryPoint];
    while (pending.length > 0) {
        const current = pending.pop()!;
        const resolved = resolve(current);
        if (visited.has(resolved)) continue;
        visited.add(resolved);
        const text = await readFile(resolved, "utf8");
        for (const match of text.matchAll(/(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/g)) {
            const specifier = match[1];
            if (specifier === undefined || !specifier.startsWith(".")) continue;
            const target = await resolveSourceImport(dirname(resolved), specifier);
            if (target !== undefined) pending.push(target);
        }
    }
    return [...visited].sort();
}

async function resolveSourceImport(directory: string, specifier: string): Promise<string | undefined> {
    const base = resolve(directory, specifier);
    const extensionless = extname(base) === ".js" || extname(base) === ".mjs"
        ? base.slice(0, -extname(base).length)
        : base;
    const candidates = [base, extensionless, ...[".ts", ".tsx", ".js", ".mjs"].flatMap((extension) => [`${extensionless}${extension}`, `${base}${extension}`]), ...["index.ts", "index.tsx", "index.js"].map((name) => join(base, name))];
    for (const candidate of candidates) {
        try { await readFile(candidate); return candidate; } catch { /* try next extension */ }
    }
    return undefined;
}

async function digestFiles(projectRoot: string, paths: readonly string[]): Promise<string> {
    const hash = createHash("sha256");
    for (const path of [...new Set(paths)].sort()) {
        if (!isAbsolute(path)) throw new Error(`Worker input must be absolute: ${path}`);
        hash.update(relative(projectRoot, path).split("\\").join("/") + "\0");
        hash.update(await readFile(path));
        hash.update("\0");
    }
    return hash.digest("hex");
}

function sha256(value: Uint8Array | string): string {
    return createHash("sha256").update(value).digest("hex");
}

function isAlreadyExists(error: unknown): boolean {
    return isRecord(error) && (error.code === "EEXIST" || error.code === "ENOTEMPTY");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
