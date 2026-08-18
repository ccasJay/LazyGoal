import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);
const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Profile 文件协议的当前版本。 */
const AGENT_PROFILE_FILE_SCHEMA_VERSION = 1 as const;

/**
 * Profile 文件的严格 JSON Schema。
 *
 * @remarks
 * 文件协议包含存储版本和展示元数据；`name`、`description` 不参与 Prompt
 * 生成，但会随新建 Goal 的冻结 Profile 一起保存。`.strict()` 会拒绝未声明
 * 的额外字段，避免手工配置悄悄进入未实现的语义。
 *
 * @example
 * ```ts
 * const result = AgentProfileFileSchema.safeParse(JSON.parse(text));
 * if (!result.success) throw result.error;
 * ```
 */
const AgentProfileFileSchema = z.object({
    schemaVersion: z.literal(AGENT_PROFILE_FILE_SCHEMA_VERSION),
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    systemPrompt: NonEmptyStringSchema,
    instructions: z.array(NonEmptyStringSchema),
    toolIds: z.array(NonEmptyStringSchema),
}).strict();

/** Profile 文件无法读取或不符合当前协议时的稳定错误码。 */
const INVALID_AGENT_PROFILE_CODE = "INVALID_AGENT_PROFILE" as const;

/**
 * Profile 文件读取或校验失败。
 *
 * @remarks
 * 缺失文件由 {@link JsonFileAgentProfileStore.load} 以 `undefined` 表示；该
 * 错误只表示路径不安全、文件系统读取失败、JSON 无效或 Schema 不匹配。
 * `issues` 在 Zod 校验失败时保留原始问题，便于 CLI 或测试展示定位信息。
 *
 * @example
 * ```ts
 * try {
 *     await store.load("default");
 * } catch (error) {
 *     if (error instanceof AgentProfileConfigurationError) {
 *         console.error(error.code, error.filePath);
 *     }
 * }
 * ```
 */
export class AgentProfileConfigurationError extends Error {
    /** 调用方可稳定判断的 Profile 配置错误码。 */
    readonly code = INVALID_AGENT_PROFILE_CODE;
    /** 请求加载的 Profile ID。 */
    readonly profileId: string;
    /** 发生错误的 Profile 文件路径。 */
    readonly filePath: string;
    /** Zod 结构校验失败时的原始问题列表。 */
    readonly issues?: readonly z.ZodIssue[];
    /** 底层 JSON 或文件系统异常。 */
    readonly cause?: unknown;

    /**
     * @param profileId - 请求加载的 Profile ID。
     * @param filePath - 对应的文件路径。
     * @param message - 面向调用方的错误说明。
     * @param details - 可选的 Zod 问题和底层原因。
     */
    constructor(
        profileId: string,
        filePath: string,
        message: string,
        details: {
            readonly cause?: unknown;
            readonly issues?: readonly z.ZodIssue[];
        } = {},
    ) {
        super(`Invalid Agent Profile "${profileId}" at ${filePath}: ${message}`);
        this.name = "AgentProfileConfigurationError";
        this.profileId = profileId;
        this.filePath = filePath;

        if (details.cause !== undefined) {
            this.cause = details.cause;
        }

        if (details.issues !== undefined) {
            this.issues = details.issues;
        }
    }
}

/**
 * 启动 Goal 时冻结到快照中的 Agent 配置。
 *
 * @remarks
 * `systemPrompt` 和 `instructions` 共同约束模型行为；`toolIds` 只保存 Tool
 * 标识，不保存 Tool 实例。`name` 和 `description` 是可选的运行时元数据，
 * 允许旧 Goal 快照在新增文件字段后继续恢复；由文件加载器生成的新 Profile
 * 会始终包含它们。当前 LLM Preparation/Step Executor 会消费冻结 Profile，
 * 但不负责读取文件或解析 Registry。
 *
 * @example
 * ```ts
 * const profile: AgentProfile = {
 *     id: "default",
 *     name: "Default",
 *     description: "通用 Agent",
 *     systemPrompt: "You are LazyGoal.",
 *     instructions: ["Use only authorized tools."],
 *     toolIds: ["read_file"],
 * };
 * ```
 */
export interface AgentProfile {
    readonly id: string;
    /** 面向用户或 Profile 列表的稳定显示名称；旧快照中可以缺失。 */
    readonly name?: string;
    /** Profile 的人工维护说明；旧快照中可以缺失。 */
    readonly description?: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}
/**
 * Launcher 查找 Profile 的最小注册表边界。
 *
 * @remarks
 * Registry 可以由内存、配置文件或外部服务实现。Launcher 会复制查找到的
 * Profile，后续 Registry 变化不会修改已经创建的 Goal 快照。
 */
export interface AgentProfileRegistry {
    /**
     * @param profileId - Profile 的稳定标识。
     * @returns 对应 Profile；不存在时返回 `undefined`。
     */
    get(profileId: string): AgentProfile | undefined;
}

/**
 * 按当前生效的 Profile ID 从 workspace 配置目录加载单个 Profile。
 *
 * @remarks
 * 每次 `load` 只访问 `<directory>/<profileId>.json`，不会扫描目录或校验其它
 * Profile。文件缺失返回 `undefined`；文件存在但 JSON、Schema 或 ID 不匹配时
 * 抛出 {@link AgentProfileConfigurationError}。加载结果不包含 Tool 实例，Tool
 * ID 与当前 Tool Registry 的关联由 Composition Root 在装配时校验。
 *
 * @example
 * ```ts
 * const store = new JsonFileAgentProfileStore(".lazygoal/profiles");
 * const profile = await store.load("default");
 * ```
 */
export class JsonFileAgentProfileStore {
    /**
     * @param directory - Profile JSON 文件所在的 workspace 目录。
     */
    constructor(private readonly directory: string) {}

    /**
     * 读取并严格校验一个指定 Profile 文件。
     *
     * @param profileId - 用于定位 `<profileId>.json` 的安全稳定 ID。
     * @returns 加载后的 Profile；文件不存在时返回 `undefined`。
     * @throws `AgentProfileConfigurationError` 当 ID 不安全、文件读取失败、
     *   JSON 无效、Schema 不匹配或文件内 ID 不一致时抛出。
     */
    async load(profileId: string): Promise<AgentProfile | undefined> {
        const filePath = this.filePath(profileId);
        let text: string;

        try {
            text = await readFile(filePath, "utf8");
        } catch (error: unknown) {
            if (isNodeError(error) && error.code === "ENOENT") {
                return undefined;
            }

            throw new AgentProfileConfigurationError(
                profileId,
                filePath,
                "Profile 文件无法读取",
                { cause: error },
            );
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(text) as unknown;
        } catch (error: unknown) {
            throw new AgentProfileConfigurationError(
                profileId,
                filePath,
                "Profile 文件不是合法 JSON",
                { cause: error },
            );
        }

        const result = AgentProfileFileSchema.safeParse(parsed);

        if (!result.success) {
            throw new AgentProfileConfigurationError(
                profileId,
                filePath,
                "Profile 文件不符合 Schema",
                { issues: result.error.issues },
            );
        }

        if (result.data.id !== profileId) {
            throw new AgentProfileConfigurationError(
                profileId,
                filePath,
                `文件内 id 必须为 "${profileId}"`,
            );
        }

        return {
            id: result.data.id,
            name: result.data.name,
            description: result.data.description,
            systemPrompt: result.data.systemPrompt,
            instructions: [...result.data.instructions],
            toolIds: [...result.data.toolIds],
        };
    }

    private filePath(profileId: string): string {
        const filePath = join(this.directory, `${profileId}.json`);

        if (!PROFILE_ID_PATTERN.test(profileId)) {
            throw new AgentProfileConfigurationError(
                profileId,
                filePath,
                "Profile ID 只能包含字母、数字、点、下划线和连字符，且必须以字母或数字开头",
            );
        }

        return filePath;
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}
