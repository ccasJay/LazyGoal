import { z } from "zod";

/** Profile 文件协议的当前版本。 */
export const AGENT_PROFILE_FILE_SCHEMA_VERSION = 1 as const;

/** Profile 文件名允许的稳定 ID 字符集。 */
export const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const NonEmptyStringSchema = z.string().min(1);

/**
 * Agent Profile 文件在磁盘上的严格 DTO。
 *
 * @remarks
 * 文件协议包含存储版本和展示元数据；`name`、`description` 不参与 Prompt
 * 生成，但会随新建 Goal 的冻结 Profile 一起保存。该类型只描述存储表示，
 * Runtime 侧的领域契约见 `@lazygoal/runtime` 的 `AgentProfile`。
 *
 * @example
 * ```ts
 * const file: AgentProfileFile = {
 *     schemaVersion: 1,
 *     id: "default",
 *     name: "Default",
 *     description: "通用 LazyGoal Agent",
 *     systemPrompt: "You are LazyGoal.",
 *     instructions: ["Use only authorized tools."],
 *     toolIds: ["read_file"],
 * };
 * ```
 */
export interface AgentProfileFile {
    readonly schemaVersion: typeof AGENT_PROFILE_FILE_SCHEMA_VERSION;
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/**
 * Profile 文件的严格 JSON Schema。
 *
 * @remarks
 * `.strict()` 会拒绝未声明的额外字段，避免手工配置悄悄进入未实现的语义。
 * Schema 只负责文件协议校验，不读取文件系统，也不构造 Runtime Profile。
 *
 * @example
 * ```ts
 * const result = AgentProfileFileSchema.safeParse(JSON.parse(text));
 * if (!result.success) throw result.error;
 * ```
 */
export const AgentProfileFileSchema = z.object({
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
