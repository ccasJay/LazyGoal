import type {
    PermissionExemptionService,
    PermissionExemptionSummary,
    SandboxGrantStore,
} from "./types";

/**
 * 基于边界账本的豁免管理服务。
 *
 * @remarks
 * 只读取与撤销边界（sandbox）账本；Tool 级持续授权已退役，本服务不提供对应分支。
 *
 * @example
 * ```ts
 * const service = new DefaultPermissionExemptionService(sandboxStore);
 * const exemptions = await service.list({ workspaceId: "ws-1" });
 * ```
 */
export class DefaultPermissionExemptionService implements PermissionExemptionService {
    constructor(private readonly sandboxStore: SandboxGrantStore) {}

    /**
     * 列出当前项目与会话中的边界越界豁免。
     */
    async list(query: {
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<readonly PermissionExemptionSummary[]> {
        const grants = await this.sandboxStore.list(query);
        return grants
            .map((grant) => ({
                id: grant.id,
                scope: grant.scope,
                workspaceId: grant.workspaceId,
                ...(grant.goalId !== undefined ? { goalId: grant.goalId } : {}),
                toolId: grant.matcher.toolId,
                inputDigest: grant.matcher.inputDigest,
                status: grant.status,
                extraFiles: grant.matcher.scope.extraFiles,
                network: grant.matcher.scope.network,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    /**
     * 精确撤销指定 ID 的边界越界豁免。
     */
    async revoke(query: {
        readonly grantId: string;
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<void> {
        await this.sandboxStore.revoke(query);
    }
}
