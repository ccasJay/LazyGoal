import { contract } from "../../../packages/contracts/src/index.js";

/**
 * Context 场景 shell 工具的唯一输入 Contract（过渡期供模型线消费）。
 *
 * @remarks
 * 联合切换后由生成的输入绑定取代该 AST，模型声明直接读取绑定 Schema。
 */

/**
 * `context_shell` 的结构化输入。
 */
export interface ContextShellInput {
    /** 要在隔离项目工作区执行的 shell 命令。 */
    readonly command: string;
}
