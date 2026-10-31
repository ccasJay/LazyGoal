import type { ContractIssue } from "../../contract-binding/src/index";

/** Profile 文件协议的当前版本。 */
export const AGENT_PROFILE_FILE_SCHEMA_VERSION = 1 as const;

/** Profile 文件名允许的稳定 ID 字符集。 */
export const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Agent Profile 文件协议中的非空字符串。
 *
 * @remarks
 * 标量字段与数组元素共用该类型，非空约束由下方注解生成。空数组本身合法，
 * 含空字符串的元素会使文件读取失败。
 *
 * @minLength 1
 *
 * @example
 * ```ts
 * const toolId: NonEmptyString = "read_file";
 * ```
 */
export type NonEmptyString = string;

/**
 * Agent Profile 文件在磁盘上的严格 DTO。
 *
 * @remarks
 * 文件协议包含存储版本和展示元数据；`name`、`description` 不参与 Prompt
 * 生成，但会随新建 Goal 的冻结 Profile 一起保存。该类型只描述存储表示，
 * Runtime 侧的领域契约见 `@lazygoal/runtime` 的 `AgentProfile`。Catalog 从
 * 该类型生成 Schema、校验器和绑定，字段与约束不在此文件外重复维护。
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
    readonly id: NonEmptyString;
    readonly name: NonEmptyString;
    readonly description: NonEmptyString;
    readonly systemPrompt: NonEmptyString;
    readonly instructions: readonly NonEmptyString[];
    readonly toolIds: readonly NonEmptyString[];
}

/** Profile 文件无法读取或不符合当前协议时的稳定错误码。 */
const INVALID_AGENT_PROFILE_CODE = "INVALID_AGENT_PROFILE" as const;

/**
 * Profile 文件读取或校验失败。
 *
 * @remarks
 * 缺失文件由 {@link JsonFileAgentProfileStore.load} 以 `undefined` 表示；该
 * 错误只表示路径不安全、文件系统读取失败、JSON 无效或生成绑定拒绝文件。
 * `issues` 在结构校验失败时保留有界的字段路径与问题分类，不包含字段值或
 * 原始文件正文；`truncated` 表示问题列表因上限被截断。
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
    /** 生成绑定结构校验失败时的安全字段问题。 */
    readonly issues?: readonly ContractIssue[];
    /** 问题列表是否因上限被截断。 */
    readonly truncated?: boolean;
    /** 底层文件系统异常；不保存可能回显文件正文的 JSON 解析异常。 */
    readonly cause?: unknown;

    /**
     * @param profileId - 请求加载的 Profile ID。
     * @param filePath - 对应的文件路径。
     * @param message - 面向调用方的错误说明。
     * @param details - 可选的安全字段问题、截断标记和底层原因。
     */
    constructor(
        profileId: string,
        filePath: string,
        message: string,
        details: {
            readonly cause?: unknown;
            readonly issues?: readonly ContractIssue[];
            readonly truncated?: boolean;
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

        if (details.truncated !== undefined) {
            this.truncated = details.truncated;
        }
    }
}
