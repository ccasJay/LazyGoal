/**
 * TUA-Bench 评测任务强类型契约。
 *
 * @remarks
 * 描述 TUA-Bench 中单个终端任务的元数据、环境要求与评分规约。
 *
 * @example
 * ```ts
 * const task: TuaBenchTaskDefinition = {
 *   taskId: "doc-edit-01",
 *   name: "doc-edit-01",
 *   instruction: "Edit the file foo.txt",
 *   taskFamily: "document",
 *   imageRef: "tua-bench/doc-edit-01:latest",
 *   networkMode: "none",
 *   agentTimeoutSec: 600,
 *   verifierTimeoutSec: 600,
 *   verifierUser: "root",
 *   taskDir: "/path/to/tasks/doc-edit-01",
 * };
 * ```
 */
export interface TuaBenchTaskDefinition {
    /** 任务唯一标识符（默认为任务目录名）。 */
    readonly taskId: string;
    /** 任务名称。 */
    readonly name: string;
    /** Agent 执行指令内容（来源于 instruction.md）。 */
    readonly instruction: string;
    /** 任务所属族/分类（来源于 metadata.category）。 */
    readonly taskFamily: string;
    /** Docker 镜像引用（来源于 environment.docker_image 或默认构建 tag）。 */
    readonly imageRef: string;
    /** 容器网络访问模式：'none' 为无网络隔离，'public' 为放行外部网络。 */
    readonly networkMode: "none" | "public";
    /** Agent 终端执行超时时间（秒），缺省 600s。 */
    readonly agentTimeoutSec: number;
    /** 验证脚本执行超时时间（秒），缺省 600s。 */
    readonly verifierTimeoutSec: number;
    /** 验证脚本执行用户，缺省 "root"。 */
    readonly verifierUser: string;
    /** 任务目录绝对路径。 */
    readonly taskDir: string;
    /** 确定性 setup 脚本相对路径，缺省 "environment/setup.sh"。 */
    readonly setupScript?: string;
    /** 评分验证脚本相对路径，缺省 "tests/test.sh"。 */
    readonly verifierPath?: string;
}

/**
 * TUA-Bench 任务清单。
 *
 * @remarks
 * 聚合 TUA-Bench 仓库中所有已成功解析的任务定义，并按任务族进行分组。
 *
 * @example
 * ```ts
 * const manifest: TuaBenchManifest = {
 *   tasks: [],
 *   repoRoot: "/path/to/tua-bench",
 *   loadedAt: "2026-09-20T12:00:00.000Z",
 *   byFamily: {},
 * };
 * ```
 */
export interface TuaBenchManifest {
    /** 全部可用任务列表。 */
    readonly tasks: readonly TuaBenchTaskDefinition[];
    /** TUA-Bench 仓库根目录。 */
    readonly repoRoot: string;
    /** 加载完成的 ISO 8601 时间戳。 */
    readonly loadedAt: string;
    /** 按任务族分组的任务字典。 */
    readonly byFamily: Readonly<Record<string, readonly TuaBenchTaskDefinition[]>>;
    /** 加载期间跳过的任务警告信息列表。 */
    readonly warnings?: readonly string[];
}

/**
 * TUA-Bench 评分与领域判定结果。
 *
 * @remarks
 * 记录任务所属族、通过状态、reward 数值以及验证脚本的输出或错误。
 *
 * @example
 * ```ts
 * const result: TuaBenchDomainResult = {
 *   taskFamily: "document",
 *   passed: true,
 *   reward: 1.0,
 *   verifierOutput: "All tests passed",
 *   verifierError: null,
 * };
 * ```
 */
export interface TuaBenchDomainResult {
    /** 任务族。 */
    readonly taskFamily: string;
    /** 是否通过评测（reward >= 1.0 为 true，否则为 false；评测异常时为 null）。 */
    readonly passed: boolean | null;
    /** 评分 reward 原始浮点数值。 */
    readonly reward: number | null;
    /** 验证脚本的标准输出。 */
    readonly verifierOutput: string | null;
    /** 验证脚本的执行失败信息或异常描述。 */
    readonly verifierError: string | null;
}

/**
 * TUA-Bench 容器产物回收结果。
 *
 * @remarks
 * 封装在 collectArtifacts 阶段从容器回收的日志、reward 文件内容与领域判定对象。
 *
 * @example
 * ```ts
 * const artifacts: TuaBenchCollectedArtifacts = {
 *   reward: 1.0,
 *   rewardRaw: "1.0",
 *   verifierStdout: "ok",
 *   verifierStderr: "",
 *   verifierExitCode: 0,
 *   domainResult: {
 *     taskFamily: "document",
 *     passed: true,
 *     reward: 1.0,
 *     verifierOutput: "ok",
 *     verifierError: null,
 *   },
 * };
 * ```
 */
export interface TuaBenchCollectedArtifacts {
    /** 解析出的 reward 数值。 */
    readonly reward: number | null;
    /** 原始 reward 文本内容。 */
    readonly rewardRaw: string | null;
    /** 验证脚本 stdout。 */
    readonly verifierStdout: string;
    /** 验证脚本 stderr。 */
    readonly verifierStderr: string;
    /** 验证脚本退出码。 */
    readonly verifierExitCode: number;
    /** 映射的领域结果对象。 */
    readonly domainResult: TuaBenchDomainResult;
}

