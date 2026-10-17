/**
 * 生成 Agent 能力拆包的行为对照基线。
 *
 * @remarks
 * 只在迁移前或明确需要重建对照数据时手动运行：
 * `npx tsx packages/agent/test/component-extraction-baseline.generate.ts`
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
process.stdout.write(`组件拆包行为基线已写入 ${outputPath}\n`);
