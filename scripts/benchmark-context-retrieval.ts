import { runFixedCorpusEvaluation } from "../packages/context-retrieval/test/evaluation-corpus";

console.log("=== Context Retrieval Fixed Corpus Benchmark ===");
const report = runFixedCorpusEvaluation();

console.log(`Recall@5:          ${(report.recallAt5 * 100).toFixed(1)}% (expected >= 100.0%)`);
console.log(`MRR:               ${report.mrr.toFixed(4)} (expected >= 1.0000)`);
console.log(`Negative Accuracy: ${(report.negativeAccuracy * 100).toFixed(1)}% (expected >= 100.0%)`);
console.log(`Positive Queries:  ${report.positiveCount}`);
console.log(`Negative Queries:  ${report.negativeCount}`);
console.log(`Tokenization Time: ${report.tokenizationTimeMs.toFixed(2)} ms`);
console.log(`Total Query Time:  ${report.queryTimeMs.toFixed(2)} ms (avg ${(report.queryTimeMs / (report.positiveCount + report.negativeCount)).toFixed(2)} ms/query)`);
console.log("================================================");
