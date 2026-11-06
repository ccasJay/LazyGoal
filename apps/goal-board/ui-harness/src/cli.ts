#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { captureScreenshot } from "./capture";
import { allFlows, observeFlow, runFlow } from "./flows";
import { createFixtureServer } from "./fixture-server";
import { allScenarios } from "./scenarios";
import {
  VIEW_REGISTRY,
  launchEnvironment,
  type ViewName,
} from "./view-registry";

function asString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

/**
 * 将用户传入的相对路径解析为调用目录下的绝对路径。
 *
 * @remarks
 * harness 通过 `npm run --prefix` 启动，进程工作目录是 apps/goal-board；
 * 用户提供的路径应以最初执行 npm 的目录为基准，因此优先使用 INIT_CWD。
 */
export function resolveUserPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function printHelp(): void {
  console.log(`
LazyGoal UI Harness CLI

Usage:
  npm run ui -- <command> [options]

Commands:
  shot      Open view and take a screenshot (full-page or element selector)
  inspect   Open view and collect console errors, exceptions, and network failures
  flow      Run a scripted interaction flow and report each step
  observe   Run a flow while recording frames and page facts for visual review
  serve     Start a long-running fixture server (for manual debugging or --attach)

Options:
  --view <name>        View to open: board | session | trajectory | settings
  --goal <id>          Override target Goal ID
  --selector <sel>     CSS selector to screenshot specific element
  --out <path>         Output path for screenshot image
  --report <path>      Output path for JSON diagnostics report
  --attach <url>       Attach to an already running web service (skips fixture server)
  --scenario <name>    Fixture scenario name (default determined by view)
  --flow <id>          Flow to run with the flow or observe command
  --interval <ms>      Frame interval for observe (default 400)
  --out <path>         Output directory for observe frames and manifest
  --artifacts <path>   Directory for failure screenshots
  --port <number>      Port for serve command (default 0 / random)
  --dist <path>        Path to static web dist directory
  --json               Output single-line machine-readable JSON
  --help               Show this help message
`);
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  const restArgs = argv.slice(1);

  if (command === "serve") {
    const { values } = parseArgs({
      args: restArgs,
      options: {
        scenario: { type: "string" },
        port: { type: "string" },
        dist: { type: "string" },
        json: { type: "boolean" },
      },
      strict: false,
    });

    const scenarioId = asString(values.scenario) ?? "board-populated";
    const scenario = allScenarios[scenarioId];
    if (!scenario) {
      console.error(`Error: Unknown scenario "${scenarioId}". Available: ${Object.keys(allScenarios).join(", ")}`);
      return 1;
    }

    const port = values.port ? Number(values.port) : 0;
    const distValue = asString(values.dist);
    const distDir = distValue ? resolveUserPath(distValue) : resolve(import.meta.dirname, "../../dist");

    const server = await createFixtureServer({
      scenario,
      port,
      distDir,
    });

    const manifest = {
      status: "ready",
      origin: server.origin,
      launchUrl: server.launchUrl,
      scenario: scenario.id,
    };

    if (values.json) {
      console.log(JSON.stringify(manifest));
    } else {
      console.log(`UI Fixture Server started at: ${server.origin}`);
      console.log(`Launch URL with auth token: ${server.launchUrl}`);
      console.log(`Scenario: ${scenario.id}`);
      console.log("Press Ctrl+C to stop.");
    }

    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    // 维持常驻
    await new Promise(() => {});
    return 0;
  }

  if (command === "observe") {
    const { values } = parseArgs({
      args: restArgs,
      options: {
        flow: { type: "string" },
        out: { type: "string" },
        interval: { type: "string" },
        maxFrames: { type: "string" },
        json: { type: "boolean" },
      },
      strict: false,
    });

    const flowId = asString(values.flow) ?? "send-message";
    const flow = allFlows[flowId];
    if (flow === undefined) {
      console.error(`Error: Unknown flow "${flowId}". Available: ${Object.keys(allFlows).join(", ")}`);
      return 1;
    }

    const outArg = asString(values.out);
    const intervalArg = asString(values.interval);
    const maxFramesArg = asString(values.maxFrames);
    const report = await observeFlow(flow, {
      ...(outArg === undefined ? {} : { outDir: resolveUserPath(outArg) }),
      ...(intervalArg === undefined ? {} : { intervalMs: Number(intervalArg) }),
      ...(maxFramesArg === undefined ? {} : { maxFrames: Number(maxFramesArg) }),
    });

    if (values.json) {
      console.log(JSON.stringify(report));
    } else {
      console.log(`Observation: ${report.flowId} (${report.view})`);
      console.log(`Frames: ${report.frames.length} in ${report.outDir}`);
      console.log(`Manifest: ${report.manifestPath}`);
      for (const frame of report.frames) {
        console.log(`  ${String(frame.index + 1).padStart(3, "0")} +${frame.capturedAtMs}ms ${frame.label} | ${frame.facts.sendLabel ?? "no send"} | ${frame.facts.runStatuses.join(",") || "no runs"}`);
      }
      if (report.ok) {
        console.log("Observation result: PASSED");
      } else {
        console.error(`Observation result: FAILED — ${report.error ?? "runtime diagnostics failed"}`);
      }
    }

    return report.ok ? 0 : 1;
  }

  if (command === "flow") {
    const { values } = parseArgs({
      args: restArgs,
      options: {
        flow: { type: "string" },
        report: { type: "string" },
        artifacts: { type: "string" },
        json: { type: "boolean" },
      },
      strict: false,
    });

    const flowId = asString(values.flow) ?? "send-message";
    const flow = allFlows[flowId];
    if (flow === undefined) {
      console.error(`Error: Unknown flow "${flowId}". Available: ${Object.keys(allFlows).join(", ")}`);
      return 1;
    }

    const artifactsArg = asString(values.artifacts);
    const report = await runFlow(
      flow,
      artifactsArg === undefined ? undefined : resolveUserPath(artifactsArg),
    );

    const reportArg = asString(values.report);
    if (reportArg !== undefined) {
      const reportPath = resolveUserPath(reportArg);
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    }

    if (values.json) {
      console.log(JSON.stringify(report));
    } else {
      console.log(`Flow: ${report.flowId} (${report.view})`);
      for (const step of report.steps) {
        console.log(`${step.ok ? "PASS" : "FAIL"} ${step.index + 1}. ${step.action} — ${step.detail}`);
      }
      if (report.ok) {
        console.log("Flow result: PASSED");
      } else {
        console.error(`Flow result: FAILED — ${report.error ?? "runtime diagnostics failed"}`);
        if (report.screenshot !== undefined) console.error(`Screenshot: ${report.screenshot}`);
      }
    }

    return report.ok ? 0 : 1;
  }

  if (command === "shot" || command === "inspect") {
    const { values } = parseArgs({
      args: restArgs,
      options: {
        view: { type: "string" },
        goal: { type: "string" },
        selector: { type: "string" },
        out: { type: "string" },
        report: { type: "string" },
        attach: { type: "string" },
        scenario: { type: "string" },
        dist: { type: "string" },
        json: { type: "boolean" },
      },
      strict: false,
    });

    const viewName = (asString(values.view) ?? "board") as ViewName;
    if (!VIEW_REGISTRY[viewName]) {
      console.error(`Error: Unknown view "${viewName}". Available: ${Object.keys(VIEW_REGISTRY).join(", ")}`);
      return 1;
    }

    const scenarioArg = asString(values.scenario);
    const scenarioOverride = scenarioArg ? allScenarios[scenarioArg] : undefined;
    if (scenarioArg && !scenarioOverride) {
      console.error(`Error: Unknown scenario "${scenarioArg}". Available: ${Object.keys(allScenarios).join(", ")}`);
      return 1;
    }

    let env: Awaited<ReturnType<typeof launchEnvironment>> | undefined;
    try {
      const distArg = asString(values.dist);
      env = await launchEnvironment({
        view: viewName,
        goalId: asString(values.goal),
        scenario: scenarioOverride,
        attachUrl: asString(values.attach),
        distDir: distArg ? resolveUserPath(distArg) : undefined,
      });

      let screenshotResult: { outPath: string; width: number; height: number } | undefined;
      if (command === "shot") {
        const defaultArtifactsDir = resolve(import.meta.dirname, "../visual/artifacts");
        const outArg = asString(values.out);
        const outPath = outArg
          ? resolveUserPath(outArg)
          : join(defaultArtifactsDir, `${viewName}-${Date.now()}.png`);
        screenshotResult = await captureScreenshot({
          page: env.page,
          outPath,
          selector: asString(values.selector),
        });
      }

      const report = env.diagnostics.getReport();

      const reportArg = asString(values.report);
      if (reportArg) {
        const reportPath = resolveUserPath(reportArg);
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
      }

      const output = {
        ok: report.ok,
        command,
        view: viewName,
        screenshot: screenshotResult,
        diagnostics: report,
      };

      if (values.json) {
        console.log(JSON.stringify(output));
      } else {
        if (screenshotResult) {
          console.log(`Screenshot saved to: ${screenshotResult.outPath} (${screenshotResult.width}x${screenshotResult.height})`);
        }
        if (report.ok) {
          console.log(`Diagnostics: PASSED (0 errors, ${report.consoleWarnings.length} warnings)`);
        } else {
          console.error(`Diagnostics: FAILED with ${report.failureCount} error(s)`);
          if (report.consoleErrors.length > 0) {
            console.error("Console errors:", report.consoleErrors.map((c) => c.text));
          }
          if (report.pageErrors.length > 0) {
            console.error("Page errors:", report.pageErrors.map((p) => p.message));
          }
          if (report.httpErrors.length > 0) {
            console.error("HTTP errors:", report.httpErrors.map((h) => `${h.status} ${h.url}`));
          }
        }
      }

      return report.ok ? 0 : 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (values.json) {
        console.log(JSON.stringify({ ok: false, error: message }));
      } else {
        console.error(`Failed to execute "${command}":`, message);
      }
      return 1;
    } finally {
      if (env) {
        await env.cleanup();
      }
    }
  }

  console.error(`Unknown command "${command}". Run "npm run ui -- --help" for usage.`);
  return 1;
}

// 如果作为命令行入口直接执行
if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  runCli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
