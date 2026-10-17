import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LazyGoalHomePaths } from "./home";
import {
    ProviderProfileValidationError,
    validateProviderProfileDraft,
    type ProviderProfile,
    type ProviderProfileDraft,
} from "./provider-profile";

const PROVIDER_PROFILES_SCHEMA_VERSION = 1;
const PROVIDER_PROFILES_FILE = "provider-profiles.json";

/**
 * Provider 档案文件协议错误。
 *
 * @remarks
 * 文件不是合法 JSON、缺少 schema 版本、版本不受支持或档案内容校验失败时抛出；
 * 读取失败一律 fail-fast，不得静默重建或丢弃用户已保存的档案。
 */
export class ProviderProfileProtocolError extends Error {
    readonly code = "INVALID_PROVIDER_PROFILES";

    constructor(message: string) {
        super(message);
        this.name = "ProviderProfileProtocolError";
    }
}

/** 目标 Provider 档案不存在。 */
export class ProviderProfileNotFoundError extends Error {
    readonly code = "PROVIDER_PROFILE_NOT_FOUND";

    constructor(readonly profileId: string) {
        super(`未知的 Provider 档案 "${profileId}"`);
        this.name = "ProviderProfileNotFoundError";
    }
}

/** Provider 档案标识冲突。 */
export class ProviderProfileConflictError extends Error {
    readonly code = "PROVIDER_PROFILE_CONFLICT";

    constructor(readonly profileId: string) {
        super(`Provider 档案标识 "${profileId}" 已存在`);
        this.name = "ProviderProfileConflictError";
    }
}

/**
 * 试图删除当前激活的 Provider 档案。
 *
 * @remarks
 * 激活档案被既有 Goal 与草稿默认选择引用，删除必须被拒绝而非静默改选。
 */
export class ProviderProfileActiveDeletionError extends Error {
    readonly code = "PROVIDER_PROFILE_ACTIVE";

    constructor(readonly profileId: string) {
        super(`不能删除当前激活的 Provider 档案 "${profileId}"`);
        this.name = "ProviderProfileActiveDeletionError";
    }
}

/** Provider 档案集合与当前激活标识。 */
export interface ProviderProfileSnapshot {
    /** 当前激活档案标识；未设置时省略。 */
    readonly activeProfileId?: string;
    /** 已保存的档案列表，顺序即展示顺序。 */
    readonly profiles: readonly ProviderProfile[];
}

/**
 * Provider 档案的部分更新输入。
 *
 * @remarks
 * 只有出现在对象中的字段才会被应用；显式传入 `undefined` 表示清空该可选字段。
 * 省略 `apiKey` 表示保留原凭据。
 *
 * @example
 * ```ts
 * const patch: ProviderProfilePatch = { label: "OpenAI 备用额度" };
 * ```
 */
export interface ProviderProfilePatch {
    /** 新的展示名。 */
    readonly label?: string;
    /** 新的供应商标识。 */
    readonly kind?: string;
    /** 新的凭据；省略表示保留原值。 */
    readonly apiKey?: string;
    /** 新的默认模型。 */
    readonly defaultModel?: string;
    /** 新的端点覆盖；`undefined` 表示清空。 */
    readonly baseURL?: string | undefined;
    /** 新的上下文窗口上限；`undefined` 表示清空。 */
    readonly contextWindowTokens?: number | undefined;
    /** 新的输出上限；`undefined` 表示清空。 */
    readonly maxOutputTokens?: number | undefined;
    /** 新的结构化输出模式；`undefined` 表示清空。 */
    readonly structuredOutputMode?: string | undefined;
}

/**
 * LazyGoal Home 级 Provider 档案文件存储。
 *
 * @remarks
 * 文件为 `<home>/provider-profiles.json`，携带 schema 版本，以 0600 权限和临时文件重命名原子替换；
 * 同一实例的写入按提交顺序串行化，读取等待在途写入。文件损坏或版本不受支持时读取与写入均失败，
 * 避免覆盖用户已保存的档案。文件不存在时返回空集合，且不会创建文件或从 `config.toml` 导入凭据。
 *
 * @example
 * ```ts
 * const store = new JsonFileProviderProfileStore(resolveLazyGoalHomePaths());
 * const profile = await store.create({ label: "OpenAI", kind: "openai", apiKey: "sk-...", defaultModel: "gpt-4o" });
 * await store.setActive(profile.id);
 * ```
 */
export class JsonFileProviderProfileStore {
    private tail: Promise<void> = Promise.resolve();

    /** @param paths - 已解析的 LazyGoal Home 路径。 */
    constructor(private readonly paths: LazyGoalHomePaths) {}

    /**
     * @returns 当前保存的档案集合；文件不存在时为空集合。
     * @throws ProviderProfileProtocolError 文件损坏、版本不受支持或档案校验失败。
     */
    async list(): Promise<readonly ProviderProfile[]> {
        return (await this.readSnapshot()).profiles;
    }

    /**
     * @returns 当前激活档案标识；未设置或文件不存在时为 `undefined`。
     * @throws ProviderProfileProtocolError 文件损坏、版本不受支持或档案校验失败。
     */
    async activeProfileId(): Promise<string | undefined> {
        return (await this.readSnapshot()).activeProfileId;
    }

    /**
     * @param profileId - 目标档案标识。
     * @returns 匹配的档案；不存在时为 `undefined`。
     * @throws ProviderProfileProtocolError 文件损坏、版本不受支持或档案校验失败。
     */
    async get(profileId: string): Promise<ProviderProfile | undefined> {
        return (await this.readSnapshot()).profiles.find((profile) => profile.id === profileId);
    }

    /**
     * 创建档案并分配稳定标识。
     *
     * @param draft - 未校验的档案输入。
     * @returns 已保存的档案（含分配的 `id`）。
     * @throws ProviderProfileValidationError 校验失败（不产生任何落盘副作用）。
     * @throws ProviderProfileProtocolError 既有文件损坏或版本不受支持。
     */
    async create(draft: ProviderProfileDraft): Promise<ProviderProfile> {
        const validated = validateProviderProfileDraft(draft);
        return this.mutate((snapshot) => {
            const id = randomUUID();
            if (snapshot.profiles.some((profile) => profile.id === id)) {
                throw new ProviderProfileConflictError(id);
            }
            const profile: ProviderProfile = { id, ...validated };
            return {
                snapshot: { ...snapshot, profiles: [...snapshot.profiles, profile] },
                result: profile,
            };
        });
    }

    /**
     * 部分更新档案；省略 `apiKey` 时保留原凭据。
     *
     * @param profileId - 目标档案标识。
     * @param patch - 需要替换的字段。
     * @returns 更新后的档案。
     * @throws ProviderProfileNotFoundError 目标档案不存在。
     * @throws ProviderProfileValidationError 合并结果违规（不产生任何落盘副作用）。
     * @throws ProviderProfileProtocolError 既有文件损坏或版本不受支持。
     */
    async update(profileId: string, patch: ProviderProfilePatch): Promise<ProviderProfile> {
        return this.mutate((snapshot) => {
            const index = snapshot.profiles.findIndex((profile) => profile.id === profileId);
            if (index < 0) throw new ProviderProfileNotFoundError(profileId);
            const current = snapshot.profiles[index] as ProviderProfile;
            const validated = validateProviderProfileDraft({
                label: "label" in patch ? patch.label ?? current.label : current.label,
                kind: "kind" in patch ? patch.kind ?? current.kind : current.kind,
                apiKey: "apiKey" in patch ? patch.apiKey ?? current.apiKey : current.apiKey,
                defaultModel: "defaultModel" in patch ? patch.defaultModel ?? current.defaultModel : current.defaultModel,
                baseURL: "baseURL" in patch ? patch.baseURL : current.baseURL,
                contextWindowTokens: "contextWindowTokens" in patch ? patch.contextWindowTokens : current.contextWindowTokens,
                maxOutputTokens: "maxOutputTokens" in patch ? patch.maxOutputTokens : current.maxOutputTokens,
                structuredOutputMode: "structuredOutputMode" in patch ? patch.structuredOutputMode : current.structuredOutputMode,
            });
            const profile: ProviderProfile = { id: profileId, ...validated };
            const profiles = [...snapshot.profiles];
            profiles[index] = profile;
            return { snapshot: { ...snapshot, profiles }, result: profile };
        });
    }

    /**
     * 设置当前激活档案。
     *
     * @param profileId - 目标档案标识。
     * @throws ProviderProfileNotFoundError 目标档案不存在。
     * @throws ProviderProfileProtocolError 既有文件损坏或版本不受支持。
     */
    async setActive(profileId: string): Promise<void> {
        await this.mutate((snapshot) => {
            if (!snapshot.profiles.some((profile) => profile.id === profileId)) {
                throw new ProviderProfileNotFoundError(profileId);
            }
            return { snapshot: { ...snapshot, activeProfileId: profileId }, result: undefined };
        });
    }

    /**
     * 删除档案。
     *
     * @param profileId - 目标档案标识。
     * @returns 被删除的档案；调用方据此提示"可能存在引用该档案的 Goal"。
     * @throws ProviderProfileNotFoundError 目标档案不存在。
     * @throws ProviderProfileActiveDeletionError 目标是当前激活档案。
     * @throws ProviderProfileProtocolError 既有文件损坏或版本不受支持。
     */
    async delete(profileId: string): Promise<ProviderProfile> {
        return this.mutate((snapshot) => {
            const profile = snapshot.profiles.find((candidate) => candidate.id === profileId);
            if (!profile) throw new ProviderProfileNotFoundError(profileId);
            if (snapshot.activeProfileId === profileId) {
                throw new ProviderProfileActiveDeletionError(profileId);
            }
            return {
                snapshot: { ...snapshot, profiles: snapshot.profiles.filter((candidate) => candidate.id !== profileId) },
                result: profile,
            };
        });
    }

    private async mutate<Result>(
        operation: (snapshot: ProviderProfileSnapshot) => { readonly snapshot: ProviderProfileSnapshot; readonly result: Result },
    ): Promise<Result> {
        const run = async (): Promise<Result> => {
            const snapshot = await this.readSnapshotFile();
            const next = operation(snapshot);
            await this.writeSnapshot(next.snapshot);
            return next.result;
        };
        const result = this.tail.then(run, run);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }

    private async readSnapshot(): Promise<ProviderProfileSnapshot> {
        await this.tail;
        return this.readSnapshotFile();
    }

    private async readSnapshotFile(): Promise<ProviderProfileSnapshot> {
        let content: string;
        try {
            content = await readFile(join(this.paths.homeDirectory, PROVIDER_PROFILES_FILE), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return { profiles: [] };
            throw error;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            throw new ProviderProfileProtocolError("Provider 档案文件不是合法 JSON。");
        }
        return parseProviderProfileSnapshot(parsed);
    }

    private async writeSnapshot(snapshot: ProviderProfileSnapshot): Promise<void> {
        await mkdir(this.paths.homeDirectory, { recursive: true, mode: 0o700 });
        const target = join(this.paths.homeDirectory, PROVIDER_PROFILES_FILE);
        const temp = `${target}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
        const record = {
            version: PROVIDER_PROFILES_SCHEMA_VERSION,
            ...(snapshot.activeProfileId === undefined ? {} : { activeProfileId: snapshot.activeProfileId }),
            profiles: snapshot.profiles,
        };
        try {
            await writeFile(temp, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
            await rename(temp, target);
            if (process.platform !== "win32") await chmod(target, 0o600);
        } catch (error) {
            await unlink(temp).catch(() => undefined);
            throw error;
        }
    }
}

function parseProviderProfileSnapshot(value: unknown): ProviderProfileSnapshot {
    if (typeof value !== "object" || value === null) {
        throw new ProviderProfileProtocolError("Provider 档案文件缺少有效的顶层结构。");
    }
    const record = value as { version?: unknown; activeProfileId?: unknown; profiles?: unknown };
    if (record.version !== PROVIDER_PROFILES_SCHEMA_VERSION) {
        throw new ProviderProfileProtocolError(
            `不支持的 Provider 档案 schema 版本 "${String(record.version)}"；当前支持版本 ${PROVIDER_PROFILES_SCHEMA_VERSION}。`,
        );
    }
    if (!Array.isArray(record.profiles)) {
        throw new ProviderProfileProtocolError("Provider 档案文件缺少 profiles 数组。");
    }
    if (record.activeProfileId !== undefined && typeof record.activeProfileId !== "string") {
        throw new ProviderProfileProtocolError("Provider 档案文件的 activeProfileId 必须是字符串。");
    }

    const profiles: ProviderProfile[] = [];
    for (const entry of record.profiles) {
        if (typeof entry !== "object" || entry === null) {
            throw new ProviderProfileProtocolError("Provider 档案条目必须是对象。");
        }
        const candidate = entry as { id?: unknown };
        if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
            throw new ProviderProfileProtocolError("Provider 档案条目缺少有效的 id。");
        }
        try {
            profiles.push({ id: candidate.id, ...validateProviderProfileDraft(entry as ProviderProfileDraft) });
        } catch (error) {
            if (error instanceof ProviderProfileValidationError) {
                throw new ProviderProfileProtocolError(`Provider 档案 "${candidate.id}" 校验失败：${error.message}`);
            }
            throw error;
        }
    }
    const activeProfileId = record.activeProfileId;
    if (typeof activeProfileId === "string" && !profiles.some((profile) => profile.id === activeProfileId)) {
        throw new ProviderProfileProtocolError(`激活标识 "${activeProfileId}" 未指向任何已保存的 Provider 档案。`);
    }
    return activeProfileId === undefined ? { profiles } : { activeProfileId, profiles };
}
