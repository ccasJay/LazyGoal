import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  browserActivityPageBinding,
  browserControlReceiptBinding,
  browserGoalEventBinding,
  browserGoalListBinding,
  browserGoalSessionEnvelopeBinding,
  browserGoalSessionStateEnvelopeBinding,
  browserInteractionDetailResultBinding,
  browserModelCatalogBinding,
  browserModelInputsBinding,
  browserModelPreferenceResultBinding,
  browserPermissionExemptionResultBinding,
  browserPermissionProfileResultBinding,
  browserProviderSettingsBinding,
  browserTrajectoryDetailBinding,
  browserTrajectoryPageBinding,
  browserTrajectoryRunsBinding,
  browserTrajectoryTimelineBinding,
  browserWorkspaceContextBinding,
  sessionMetricsSnapshotBinding,
  type BrowserActivityPage,
  type BrowserControlIntentCommand,
  type BrowserControlReceipt,
  type BrowserGoalEvent,
  type BrowserGoalList,
  type BrowserGoalSessionEnvelope,
  type BrowserGoalSessionStateEnvelope,
  type BrowserInteractionDetailResult,
  type BrowserModelCatalog,
  type BrowserPermissionExemptionSummary,
  type BrowserPermissionProfileResult,
  type BrowserProviderSettings,
  type BrowserTrajectoryDetail,
  type BrowserTrajectoryPage,
  type BrowserTrajectoryRuns,
  type BrowserTrajectoryTimeline,
  type BrowserWorkspaceContext,
  type SessionMetricsSnapshot,
  type ContractBinding,
} from "../../../../packages/web-contracts/src/index";
import {
  createDefaultActivityPage,
  createDefaultGoalList,
  createDefaultGoalSessionEnvelope,
  createDefaultGoalSessionStateEnvelope,
  createDefaultModelCatalog,
  createDefaultPermissionExemptions,
  createDefaultPermissionProfileResult,
  createDefaultProviderSettings,
  createDefaultTrajectoryDetail,
  createDefaultTrajectoryPage,
  createDefaultTrajectoryRuns,
  createDefaultTrajectoryTimeline,
  createDefaultWorkspaceContext,
  createDefaultSessionMetricsSnapshot,
} from "./default-fixtures";
import type {
  FixtureEndpointConfig,
  FixtureScenario,
  FixtureServerInstance,
  FixtureServerOptions,
} from "./fixture-types";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * 校验并发送单条 JSON 响应。
 *
 * @remarks
 * 在发送前使用对应 ContractBinding 执行只读校验（strip 模式）。
 * 校验失败直接返回 HTTP 500 与详细诊断，防止向客户端发送不符合契约的伪数据。
 */
function sendValidatedJson<T>(
  res: ServerResponse,
  binding: ContractBinding<T>,
  data: unknown,
  status = 200,
): void {
  const result = binding.read(data, "strip");
  if (!result.ok) {
    const errorPayload = {
      code: "fixture_contract_validation_failed",
      status: 500,
      diagnostic: {
        contractId: result.contractId,
        version: result.version,
        issues: result.issues,
        truncated: result.truncated,
      },
    };
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(errorPayload));
    return;
  }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(result.data));
}

/** 统一处理端点覆盖模式（loading / error / success / empty）。 */
async function handleEndpointMode<T>(
  res: ServerResponse,
  config: FixtureEndpointConfig<T> | undefined,
  binding: ContractBinding<T>,
  emptyFactory: () => T,
): Promise<void> {
  const mode = config?.mode ?? "success";
  if (mode === "loading") {
    const delay = config?.delayMs ?? 60_000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (mode === "error") {
    res.writeHead(config?.errorStatus ?? 500, {
      "content-type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify({ code: config?.errorCode ?? "fixture_simulated_error" }));
    return;
  }
  if (mode === "empty") {
    sendValidatedJson(res, binding, emptyFactory());
    return;
  }
  if (config?.data === undefined) {
    sendValidatedJson(res, binding, emptyFactory());
    return;
  }
  sendValidatedJson(res, binding, config.data);
}

/** 读取并解析请求体；空体或非对象 JSON 返回 `undefined`。 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** 静态资源服务，支持 SPA HTML fallback。 */
async function serveStaticFile(
  res: ServerResponse,
  distDir: string,
  pathname: string,
  isGet: boolean,
  acceptsHtml: boolean,
): Promise<boolean> {
  if (!isGet) return false;
  let targetPath = join(distDir, pathname === "/" ? "index.html" : pathname.slice(1));
  try {
    let stats = await stat(targetPath);
    if (stats.isDirectory()) {
      targetPath = join(targetPath, "index.html");
      stats = await stat(targetPath);
    }
    const ext = extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const content = await readFile(targetPath);
    res.writeHead(200, { "content-type": contentType });
    res.end(content);
    return true;
  } catch {
    if (acceptsHtml) {
      try {
        const fallback = await readFile(join(distDir, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(fallback);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * 创建独立的 UI 验收 Fixture HTTP/SSE 服务。
 *
 * @param options - 服务器配置与初始场景。
 * @returns 可启动的服务实例。
 */
export async function createFixtureServer(
  options: FixtureServerOptions,
): Promise<FixtureServerInstance> {
  let scenario = options.scenario;
  const distDir = resolve(options.distDir ?? "apps/goal-board/dist");
  const token = options.token ?? "fixture-token";
  const metricsClients = new Set<ServerResponse>();
  const goalEventClients = new Map<string, Set<ServerResponse>>();
  const receivedIntents: BrowserControlIntentCommand[] = [];
  let closed = false;

  /** 当前场景对指定 Goal 声明的边界豁免；未声明或标记为空时返回空列表。 */
  const currentExemptions = (goalId: string): readonly BrowserPermissionExemptionSummary[] => {
    const config = scenario.permissionExemptions?.[goalId];
    return config === undefined || config.mode === "empty" || config.data === undefined
      ? createDefaultPermissionExemptions()
      : config.data;
  };

  const pushEvent = (goalId: string, event: BrowserGoalEvent): void => {
    const validated = browserGoalEventBinding.read(event, "strip");
    if (!validated.ok) {
      throw new Error(
        `fixture_event_invalid: ${validated.contractId} rejected the pushed event (${validated.issues.length} issue(s))`,
      );
    }
    const clients = goalEventClients.get(goalId);
    if (clients === undefined || closed) return;
    const payload = `data: ${JSON.stringify(validated.data)}\n\n`;
    for (const client of clients) {
      if (client.destroyed || client.writableEnded) continue;
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;

    // 1. GET /api/project/workspace
    if (method === "GET" && path === "/api/project/workspace") {
      await handleEndpointMode<BrowserWorkspaceContext>(
        res,
        scenario.workspace,
        browserWorkspaceContextBinding,
        createDefaultWorkspaceContext,
      );
      return;
    }

    // 2. GET /api/goals
    if (method === "GET" && path === "/api/goals") {
      await handleEndpointMode<BrowserGoalList>(
        res,
        scenario.goals,
        browserGoalListBinding,
        createDefaultGoalList,
      );
      return;
    }

    // 3. GET /api/goals/:goalId/events (SSE)
    const eventsMatch = path.match(/^\/api\/goals\/([^/]+)\/events$/);
    if (method === "GET" && eventsMatch) {
      const goalId = decodeURIComponent(eventsMatch[1]);
      const eventConfig = scenario.events?.[goalId];
      if (eventConfig?.mode === "loading") {
        await new Promise((resolve) => setTimeout(resolve, eventConfig.delayMs ?? 60_000));
      }
      if (eventConfig?.mode === "error") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "fixture_events_error" }));
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      const clients = goalEventClients.get(goalId) ?? new Set<ServerResponse>();
      clients.add(res);
      goalEventClients.set(goalId, clients);
      res.on("error", () => {
        clients.delete(res);
        if (clients.size === 0) goalEventClients.delete(goalId);
      });

      if (eventConfig?.initialEvents) {
        for (const evt of eventConfig.initialEvents) {
          const validated = browserGoalEventBinding.read(evt, "strip");
          if (validated.ok) {
            res.write(`data: ${JSON.stringify(validated.data)}\n\n`);
          }
        }
      }

      req.on("close", () => {
        clients.delete(res);
        if (clients.size === 0) goalEventClients.delete(goalId);
      });
      return;
    }

    // 4. GET /api/goals/:goalId/activity
    const activityMatch = path.match(/^\/api\/goals\/([^/]+)\/activity$/);
    if (method === "GET" && activityMatch) {
      const goalId = decodeURIComponent(activityMatch[1]);
      const activityConfig = scenario.activities?.[goalId];
      await handleEndpointMode<BrowserActivityPage>(
        res,
        activityConfig,
        browserActivityPageBinding,
        () => createDefaultActivityPage(goalId),
      );
      return;
    }

    // 5. GET /api/goals/:goalId/exemptions and DELETE /api/goals/:goalId/exemptions/:exemptionId
    const exemptionRevokeMatch = path.match(/^\/api\/goals\/([^/]+)\/exemptions\/([^/]+)$/);
    if (method === "DELETE" && exemptionRevokeMatch) {
      const goalId = decodeURIComponent(exemptionRevokeMatch[1]);
      const exemptionId = decodeURIComponent(exemptionRevokeMatch[2]);
      const body = await readJsonBody(req);
      const runId = typeof body?.runId === "string" ? body.runId : "run-1";
      const config = scenario.permissionExemptions?.[goalId];
      if (config?.mode === "error") {
        res.writeHead(config.errorStatus ?? 500, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: config.errorCode ?? "exemption_failed" }));
        return;
      }
      const remaining = currentExemptions(goalId).filter((exemption) => exemption.id !== exemptionId);
      scenario = {
        ...scenario,
        permissionExemptions: {
          ...scenario.permissionExemptions,
          [goalId]: { ...(scenario.permissionExemptions?.[goalId] ?? {}), data: remaining },
        },
      };
      sendValidatedJson(res, browserPermissionExemptionResultBinding, {
        ok: true,
        goalId,
        runId,
        exemptions: remaining,
      });
      return;
    }

    const exemptionsMatch = path.match(/^\/api\/goals\/([^/]+)\/exemptions$/);
    if (method === "GET" && exemptionsMatch) {
      const goalId = decodeURIComponent(exemptionsMatch[1]);
      const runId = url.searchParams.get("runId") ?? "run-1";
      const config = scenario.permissionExemptions?.[goalId];
      if (config?.mode === "error") {
        res.writeHead(config.errorStatus ?? 500, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: config.errorCode ?? "exemptions_error" }));
        return;
      }
      sendValidatedJson(res, browserPermissionExemptionResultBinding, {
        ok: true,
        goalId,
        runId,
        exemptions: currentExemptions(goalId),
      });
      return;
    }

    // 5.5 GET /api/goals/:goalId/interaction-details
    const interactionMatch = path.match(/^\/api\/goals\/([^/]+)\/interaction-details$/);
    if (method === "GET" && interactionMatch) {
      const goalId = decodeURIComponent(interactionMatch[1]);
      const runId = url.searchParams.get("runId") ?? "";
      const interactionId = url.searchParams.get("interactionId") ?? "";
      const key = `${goalId}:${runId}:${interactionId}`;
      const config = scenario.interactionDetails?.[key] ?? scenario.interactionDetails?.[goalId];
      if (config) {
        await handleEndpointMode<BrowserInteractionDetailResult>(
          res,
          config,
          browserInteractionDetailResultBinding,
          () => ({ ok: false, error: "interaction_details_unavailable" }),
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "interaction_not_found" }));
      return;
    }

    // 6. GET /api/goals/:goalId?view=state or GET /api/goals/:goalId
    const goalMatch = path.match(/^\/api\/goals\/([^/]+)$/);
    if (method === "GET" && goalMatch) {
      const goalId = decodeURIComponent(goalMatch[1]);
      const isStateView = url.searchParams.get("view") === "state";
      if (isStateView) {
        const stateConfig = scenario.goalSessionStateEnvelopes?.[goalId];
        if (!stateConfig && !scenario.goals?.data?.goals.some((g) => g.goalId === goalId)) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "goal_not_found" }));
          return;
        }
        await handleEndpointMode<BrowserGoalSessionStateEnvelope>(
          res,
          stateConfig,
          browserGoalSessionStateEnvelopeBinding,
          () => createDefaultGoalSessionStateEnvelope(goalId),
        );
        return;
      }
      const sessionConfig = scenario.goalSessionEnvelopes?.[goalId];
      if (!sessionConfig && !scenario.goals?.data?.goals.some((g) => g.goalId === goalId)) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "goal_not_found" }));
        return;
      }
      await handleEndpointMode<BrowserGoalSessionEnvelope>(
        res,
        sessionConfig,
        browserGoalSessionEnvelopeBinding,
        () => createDefaultGoalSessionEnvelope(goalId),
      );
      return;
    }

    // 7. GET /api/project/permission-profile
    if (method === "GET" && path === "/api/project/permission-profile") {
      await handleEndpointMode<BrowserPermissionProfileResult>(
        res,
        scenario.permissionProfile,
        browserPermissionProfileResultBinding,
        createDefaultPermissionProfileResult,
      );
      return;
    }

    // 8. GET /api/models or GET /api/goals/:goalId/models
    if (method === "GET" && (path === "/api/models" || /^\/api\/goals\/[^/]+\/models$/.test(path))) {
      await handleEndpointMode<BrowserModelCatalog>(
        res,
        scenario.models,
        browserModelCatalogBinding,
        createDefaultModelCatalog,
      );
      return;
    }

    // 9. POST /api/project/model-preference
    if (method === "POST" && path === "/api/project/model-preference") {
      sendValidatedJson(res, browserModelPreferenceResultBinding, { ok: true, modelId: "model-1" });
      return;
    }

    // 10. GET /api/providers
    if (method === "GET" && path === "/api/providers") {
      await handleEndpointMode<BrowserProviderSettings>(
        res,
        scenario.providerSettings,
        browserProviderSettingsBinding,
        createDefaultProviderSettings,
      );
      return;
    }

    // 11. GET /api/goals/:goalId/trajectory/runs
    const runsMatch = path.match(/^\/api\/goals\/([^/]+)\/trajectory\/runs$/);
    if (method === "GET" && runsMatch) {
      const goalId = decodeURIComponent(runsMatch[1]);
      await handleEndpointMode<BrowserTrajectoryRuns>(
        res,
        scenario.trajectoryRuns?.[goalId],
        browserTrajectoryRunsBinding,
        createDefaultTrajectoryRuns,
      );
      return;
    }

    // 12. GET /api/goals/:goalId/trajectory/timeline
    const timelineMatch = path.match(/^\/api\/goals\/([^/]+)\/trajectory\/timeline$/);
    if (method === "GET" && timelineMatch) {
      const goalId = decodeURIComponent(timelineMatch[1]);
      await handleEndpointMode<BrowserTrajectoryTimeline>(
        res,
        scenario.trajectoryTimelines?.[goalId],
        browserTrajectoryTimelineBinding,
        () => createDefaultTrajectoryTimeline(goalId),
      );
      return;
    }

    // 13. GET /api/goals/:goalId/trajectory/events/:sequence
    const detailMatch = path.match(/^\/api\/goals\/([^/]+)\/trajectory\/events\/(\d+)$/);
    if (method === "GET" && detailMatch) {
      const goalId = decodeURIComponent(detailMatch[1]);
      const seq = Number(detailMatch[2]);
      await handleEndpointMode<BrowserTrajectoryDetail>(
        res,
        scenario.trajectoryDetails?.[`${goalId}:${seq}`],
        browserTrajectoryDetailBinding,
        () => createDefaultTrajectoryDetail(goalId, seq),
      );
      return;
    }

    // 13.5 GET /api/goals/:goalId/model-inputs
    const modelInputsMatch = path.match(/^\/api\/goals\/([^/]+)\/model-inputs$/);
    if (method === "GET" && modelInputsMatch) {
      sendValidatedJson(res, browserModelInputsBinding, {
        calls: [],
        total: 0,
        nextOffset: null,
        committedThroughSequence: 0,
      });
      return;
    }

    // 14. GET /api/goals/:goalId/trajectory
    const trajMatch = path.match(/^\/api\/goals\/([^/]+)\/trajectory$/);
    if (method === "GET" && trajMatch) {
      const goalId = decodeURIComponent(trajMatch[1]);
      await handleEndpointMode<BrowserTrajectoryPage>(
        res,
        scenario.trajectories?.[goalId],
        browserTrajectoryPageBinding,
        () => createDefaultTrajectoryPage(goalId),
      );
      return;
    }

    // 14.5 GET /goals/:goalId/metrics and GET /goals/:goalId/metrics/stream
    const metricsStreamMatch = path.match(/^\/goals\/([^/]+)\/metrics\/stream$/);
    if (method === "GET" && metricsStreamMatch) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      metricsClients.add(res);
      req.on("close", () => {
        metricsClients.delete(res);
      });
      return;
    }

    const metricsMatch = path.match(/^\/goals\/([^/]+)\/metrics$/);
    if (method === "GET" && metricsMatch) {
      const goalId = decodeURIComponent(metricsMatch[1]);
      await handleEndpointMode<SessionMetricsSnapshot>(
        res,
        scenario.metrics?.[goalId],
        sessionMetricsSnapshotBinding,
        () => createDefaultSessionMetricsSnapshot(goalId),
      );
      return;
    }

    // 15. POST /api/control
    if (method === "POST" && path === "/api/control") {
      let bodyText = "";
      req.on("data", (chunk) => {
        bodyText += chunk;
      });
      req.on("end", () => {
        void (async () => {
          let command: BrowserControlIntentCommand;
          try {
            command = JSON.parse(bodyText) as BrowserControlIntentCommand;
          } catch {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "invalid_control_intent" }));
            return;
          }
          try {
            receivedIntents.push(command);
            const handled = scenario.handleControl
              ? await scenario.handleControl(command, {
                  getScenario: () => scenario,
                  updateScenario: (next) => {
                    scenario = next;
                  },
                  pushEvent,
                })
              : undefined;
            const receipt: BrowserControlReceipt = handled ?? (scenario.controlReceipt
              ? scenario.controlReceipt(command)
              : { intentId: command.intentId, status: "unknown" });
            sendValidatedJson(res, browserControlReceiptBinding, receipt);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "fixture_control_failed", message }));
          }
        })();
      });
      return;
    }

    // 16. 静态资源与 SPA 路由
    const served = await serveStaticFile(res, distDir, path, method === "GET", acceptsHtml);
    if (served) return;

    // 17. 未处理端点：显式返回 501 告知路径未打桩
    console.warn(`[fixture-server 501 unhandled] ${method} ${path}`);
    res.writeHead(501, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: "unhandled_fixture_route",
        method,
        path,
        url: req.url,
      }),
    );
  });

  const port = options.port ?? 0;
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : 0;
  const origin = `http://127.0.0.1:${actualPort}`;
  const launchUrl = `${origin}/#${token}`;

  return {
    origin,
    launchUrl,
    getScenario: () => scenario,
    updateScenario: (next: FixtureScenario) => {
      scenario = next;
    },
    pushEvent,
    getReceivedIntents: () => receivedIntents,
    close: async () => {
      closed = true;
      for (const client of goalEventClients.values()) {
        for (const stream of client) {
          try {
            stream.end();
          } catch {}
        }
      }
      goalEventClients.clear();
      for (const client of metricsClients) {
        try {
          client.end();
        } catch {}
      }
      metricsClients.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
