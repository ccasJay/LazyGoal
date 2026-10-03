import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * 单个文件的沙箱越界访问申请意图。
 *
 * @remarks
 * 由模型在输入中提出，仅代表意图申请，不作为权限凭据。
 *
 * @example
 * ```ts
 * const fileReq: SandboxFileAccessRequest = {
 *     path: "/var/log/app.log",
 *     access: "read",
 *     kind: "file",
 *     purpose: "读取日志分析错误",
 * };
 * ```
 */
export interface SandboxFileAccessRequest {
    /** 申请访问的文件或目录路径（相对或绝对）。 */
    readonly path: string;
    /** 访问方向：只读或读写。 */
    readonly access: "read" | "write";
    /** 目标资源类型：单个文件或目录树（包含递归子项）。 */
    readonly kind: "file" | "directory_tree";
    /** 申请用途说明，展示给用户审阅。 */
    readonly purpose: string;
}

/**
 * 网络的沙箱越界访问申请意图。
 *
 * @remarks
 * 模型填写的 targets 域名与用途仅供用户审阅参考，首版实际可强制能力为 `all_outbound`。
 *
 * @example
 * ```ts
 * const netReq: SandboxNetworkAccessRequest = {
 *     targets: ["api.github.com"],
 *     purpose: "拉取仓库依赖",
 * };
 * ```
 */
export interface SandboxNetworkAccessRequest {
    /** 目标网络地址或域名说明列表。 */
    readonly targets: readonly string[];
    /** 申请用途说明，展示给用户审阅。 */
    readonly purpose: string;
}

/**
 * 模型随 Bash 命令提出的完整沙箱额外能力申请。
 *
 * @example
 * ```ts
 * const request: SandboxAccessRequest = {
 *     files: [{ path: "../data", access: "read", kind: "directory_tree", purpose: "读取测试数据" }],
 *     network: { targets: ["pypi.org"], purpose: "安装依赖" },
 * };
 * ```
 */
export interface SandboxAccessRequest {
    /** 文件系统额外访问申请列表。 */
    readonly files?: readonly SandboxFileAccessRequest[];
    /** 网络访问申请。 */
    readonly network?: SandboxNetworkAccessRequest;
}

/**
 * 由 Tool 或模型输入派生的沙箱访问申请。
 *
 * @remarks
 * 与 `SandboxAccessRequest` 结构一致，供能力派生接口统一定义。
 *
 * @example
 * ```ts
 * const access: DerivedSandboxAccess = {
 *     files: [{ path: "../extra", access: "read", kind: "file", purpose: "读取附加资源" }],
 * };
 * ```
 */
export type DerivedSandboxAccess = SandboxAccessRequest;

/**
 * 经规范化后可供内核沙箱强制执行的单项文件能力。
 */
export interface EffectiveExtraFile {
    /** 已解析的真实规范化绝对路径。 */
    readonly canonicalPath: string;
    /** 访问方向。 */
    readonly access: "read" | "write";
    /** 目标形态：单文件或目录子树。 */
    readonly kind: "file" | "directory_tree";
}

/**
 * 经系统规范化后交付 Permission 判定及 Seatbelt 编译的实际沙箱能力范围。
 *
 * @remarks
 * 去除了模型主观描述，仅保留内核可强制的真实范围。
 *
 * @example
 * ```ts
 * const scope: EffectiveSandboxScope = {
 *     extraFiles: [{ canonicalPath: "/Users/test/cache", access: "read", kind: "directory_tree" }],
 *     network: "all_outbound",
 * };
 * ```
 */
export interface EffectiveSandboxScope {
    /** 规范化后的额外文件访问范围。 */
    readonly extraFiles: readonly EffectiveExtraFile[];
    /** 内核实际可强制的网络范围：none 或 all_outbound。 */
    readonly network: "none" | "all_outbound";
}

/**
 * 一次已获核准的单次沙箱执行计划。
 *
 * @remarks
 * 绑定当前工作区与 Action 期间生效的实际能力，禁止反序列化旧计划或跨 Action 复用。
 *
 * @example
 * ```ts
 * const plan: SandboxExecutionPlan = {
 *     workspaceRoot: "/workspace/project",
 *     scope: { extraFiles: [], network: "all_outbound" },
 * };
 * ```
 */
export interface SandboxExecutionPlan {
    /** 绑定的 Action 唯一标识，防止跨 Action 复用。 */
    readonly actionId?: string;
    /** 规范化的工作区根目录绝对路径。 */
    readonly workspaceRoot: string;
    /** 本次 Action 执行期间获准生效的实际能力。 */
    readonly scope: EffectiveSandboxScope;
}

/**
 * 解析路径的最近现存真实路径并规范化拼接。
 */
async function resolveCanonicalPath(rawPath: string): Promise<string> {
    try {
        return await realpath(rawPath);
    } catch {
        // 目标可能尚未创建，递归解析父目录真实路径
        const parent = dirname(rawPath);
        if (parent === rawPath) {
            return rawPath;
        }
        const resolvedParent = await resolveCanonicalPath(parent);
        return resolve(resolvedParent, rawPath.slice(parent.length + 1));
    }
}

/**
 * 将模型提出的沙箱访问申请解析为规范化的实际能力范围。
 *
 * @param workspaceRoot - 当前工作区根目录。
 * @param request - 模型提交的可选沙箱能力申请。
 * @returns 规范化的 EffectiveSandboxScope。
 * @throws 当申请访问 LazyGoal 内部私密状态等绝对禁止开放的路径时抛出异常。
 *
 * @example
 * ```ts
 * const scope = await resolveEffectiveSandboxScope("/project", {
 *     network: { targets: ["127.0.0.1"], purpose: "本地测试" },
 * });
 * ```
 */
export async function resolveEffectiveSandboxScope(
    workspaceRoot: string,
    request?: SandboxAccessRequest,
): Promise<EffectiveSandboxScope> {
    const canonicalWorkspace = await realpath(workspaceRoot);
    const network: "none" | "all_outbound" =
        request?.network !== undefined && request.network.targets.length > 0
            ? "all_outbound"
            : "none";

    if (request?.files === undefined || request.files.length === 0) {
        return { extraFiles: [], network };
    }

    const extraFilesMap = new Map<string, EffectiveExtraFile>();

    for (const item of request.files) {
        const absPath = isAbsolute(item.path)
            ? item.path
            : resolve(canonicalWorkspace, item.path);

        const canonical = await resolveCanonicalPath(absPath);

        // 严禁向沙箱命令开放 LazyGoal 内部持久化目录与敏感状态
        if (
            canonical === resolve(canonicalWorkspace, ".lazygoal")
            || canonical.startsWith(resolve(canonicalWorkspace, ".lazygoal") + "/")
        ) {
            throw new Error(`严禁向受限命令开放 LazyGoal 内部状态目录: ${item.path}`);
        }

        const key = `${canonical}:${item.access}:${item.kind}`;
        if (!extraFilesMap.has(key)) {
            extraFilesMap.set(key, {
                canonicalPath: canonical,
                access: item.access,
                kind: item.kind,
            });
        }
    }

    const extraFiles = Array.from(extraFilesMap.values()).sort((a, b) =>
        a.canonicalPath.localeCompare(b.canonicalPath),
    );

    return {
        extraFiles,
        network,
    };
}
