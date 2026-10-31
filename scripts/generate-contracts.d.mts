/**
 * Catalog 生成入口选项。
 *
 * @example
 * ```ts
 * const options: ContractGenerationOptions = { repositoryRoot: process.cwd() };
 * ```
 */
export interface ContractGenerationOptions {
    readonly repositoryRoot?: string;
    readonly catalogPath?: string;
}

/**
 * Catalog 生成结果。
 *
 * @remarks
 * `artifacts` 以仓库相对路径为键；生成过程中不写文件。
 *
 * @example
 * ```ts
 * const { artifacts } = await generateContractArtifacts();
 * ```
 */
export interface ContractGenerationResult {
    readonly artifacts: ReadonlyMap<string, string>;
    readonly catalog: unknown;
}

/**
 * 生成 Catalog 中全部启用契约的构建期制品。
 *
 * @param options - 仓库根目录与 Catalog 相对路径。
 * @returns 生成制品及已校验 Catalog。
 * @throws Catalog 无效、来源缺失或契约结构不受支持时拒绝生成。
 *
 * @example
 * ```ts
 * const { artifacts } = await generateContractArtifacts();
 * ```
 */
export function generateContractArtifacts(options?: ContractGenerationOptions): Promise<ContractGenerationResult>;

/**
 * 检查制品是否与当前 Catalog 和源码一致。
 *
 * @param options - 仓库根目录与 Catalog 相对路径。
 * @returns 缺失或漂移的仓库相对路径。
 *
 * @example
 * ```ts
 * const stale = await findStaleContractArtifacts();
 * ```
 */
export function findStaleContractArtifacts(options?: ContractGenerationOptions): Promise<string[]>;

/**
 * 校验生成 Schema 是否只使用支持的 JSON Schema 子集。
 *
 * @param schema - 生成器产出的根 Schema。
 * @param rootType - 契约根类型名。
 * @throws 出现联合、开放对象、元组、外部引用或未支持约束时抛出异常。
 *
 * @example
 * ```ts
 * assertSupportedSchema(schema, "BrowserProviderModels");
 * ```
 */
export function assertSupportedSchema(schema: unknown, rootType: string): void;
