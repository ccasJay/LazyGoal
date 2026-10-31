/**
 * 生成模型执行组件的行为对照基线。
 *
 * @remarks
 * 只在明确需要重建对照数据时手动运行：
 * `npx tsx packages/model-execution/test/component-extraction-baseline.generate.ts`
 * 回归测试只读取并比较基线，不会自动覆盖它。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildComponentExtractionBaseline } from "./component-extraction-baseline-scenarios";

const outputPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/component-extraction-baseline/baseline.json",
);
const baseline = await buildComponentExtractionBaseline();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
process.stdout.write(`模型执行组件行为基线已写入 ${outputPath}\n`);
