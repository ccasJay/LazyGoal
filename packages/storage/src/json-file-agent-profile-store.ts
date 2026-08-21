import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
    AgentProfile,
    AgentProfileStore,
} from "../../runtime/src/index";
import {
    AgentProfileConfigurationError,
    AgentProfileFileSchema,
    PROFILE_ID_PATTERN,
} from "./agent-profile-file";

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
export class JsonFileAgentProfileStore implements AgentProfileStore {
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
