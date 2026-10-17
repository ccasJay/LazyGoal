import type { ILoader, LoaderSource } from "nunjucks";

/**
 * 只接受已注册模板 ID 的内存 Loader。
 *
 * @remarks
 * 该 Loader 完全同步、不读取文件系统，只从构造期注入的 `Map<ID, 源码>` 中取模板。
 * 它禁止由 `PromptContext` 决定的 `{% include %}`：任何未在注册表中的名字都会抛出
 * 错误，从而保证只有 LazyGoal 注册的模板可被执行。
 *
 * @example
 * ```ts
 * const loader = new InMemoryLoader(new Map([["global-overview@1", "..."]]));
 * ```
 */
export class InMemoryLoader implements ILoader {
    readonly async = false as const;

    private readonly sources: ReadonlyMap<string, string>;

    /**
     * @param sources - 模板 ID 到已规范化（LF 换行）源码的映射。
     */
    constructor(sources: ReadonlyMap<string, string>) {
        this.sources = sources;
    }

    /**
     * @param name - 需要加载的模板 ID。
     * @returns 模板源码与固定路径标记。
     * @throws Error 模板 ID 未注册时抛出，阻止任意名称的模板加载。
     */
    getSource(name: string): LoaderSource {
        const source = this.sources.get(name);

        if (source === undefined) {
            throw new Error(`Prompt 模板未注册：${name}`);
        }

        return { src: source, path: name, noCache: false };
    }
}
