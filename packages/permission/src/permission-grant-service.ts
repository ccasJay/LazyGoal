import type {
    PermissionGrantService,
    SandboxGrantStore,
    ToolGrantStore,
    UnifiedGrantSummary,
} from "./types";

/**
 * 统一聚合 Tool Grant 与 Sandbox Grant 账本的授权管理服务实现。
 *
 * @remarks
 * 分别委托底层两个物理隔离的存储账本，统一返回聚合视图，并在撤销时精确派发。
 *
 * @example
 * ```ts
 * const service = new DefaultPermissionGrantService(toolStore, sandboxStore);
 * const list = await service.list({ workspaceId: "ws-1" });
 * ```
 */
export class DefaultPermissionGrantService implements PermissionGrantService {
    constructor(
        private readonly toolStore: ToolGrantStore,
        private readonly sandboxStore: SandboxGrantStore,
    ) {}

    /**
     * 聚合列出当前项目与会话中的两类持续授权。
     */
    async list(query: {
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<readonly UnifiedGrantSummary[]> {
        const [toolGrants, sandboxGrants] = await Promise.all([
            this.toolStore.list(query),
            this.sandboxStore.list(query),
        ]);

        const unifiedTool: UnifiedGrantSummary[] = toolGrants.map((grant) => ({
            kind: "tool" as const,
            id: grant.id,
            scope: grant.scope,
            workspaceId: grant.workspaceId,
            ...(grant.goalId !== undefined ? { goalId: grant.goalId } : {}),
            toolId: grant.matcher.toolId,
            status: grant.status,
            ...(grant.matcher.kind === "target_path" ? { targetPath: grant.matcher.path } : {}),
            ...(grant.matcher.kind === "exact_input" ? { digest: grant.matcher.digest } : {}),
        }));

        const unifiedSandbox: UnifiedGrantSummary[] = sandboxGrants.map((grant) => ({
            kind: "sandbox" as const,
            id: grant.id,
            scope: grant.scope,
            workspaceId: grant.workspaceId,
            ...(grant.goalId !== undefined ? { goalId: grant.goalId } : {}),
            toolId: grant.matcher.toolId,
            command: grant.matcher.command,
            status: grant.status,
            extraFiles: grant.matcher.scope.extraFiles,
            network: grant.matcher.scope.network,
        }));

        return [...unifiedTool, ...unifiedSandbox].sort((a, b) => a.id.localeCompare(b.id));
    }

    /**
     * 针对指定授权类别执行精确撤销。
     */
    async revoke(query: {
        readonly kind: "tool" | "sandbox";
        readonly grantId: string;
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<void> {
        if (query.kind === "tool") {
            await this.toolStore.revoke({
                grantId: query.grantId,
                workspaceId: query.workspaceId,
                ...(query.goalId !== undefined ? { goalId: query.goalId } : {}),
            });
            return;
        }

        if (query.kind === "sandbox") {
            await this.sandboxStore.revoke({
                grantId: query.grantId,
                workspaceId: query.workspaceId,
                ...(query.goalId !== undefined ? { goalId: query.goalId } : {}),
            });
            return;
        }

        throw new Error(`Unsupported grant kind: ${query.kind as string}`);
    }
}
