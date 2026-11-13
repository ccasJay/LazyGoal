import type { Page, Request, Response } from "@playwright/test";

/** 单条控制台日志诊断项。 */
export interface ConsoleDiagnostic {
  readonly type: "error" | "warning";
  readonly text: string;
  readonly location?: string;
  readonly timestamp: string;
}

/** 单条页面 JavaScript 未捕获异常。 */
export interface PageErrorDiagnostic {
  readonly message: string;
  readonly stack?: string;
  readonly timestamp: string;
}

/** 单条网络请求失败诊断。 */
export interface RequestFailureDiagnostic {
  readonly url: string;
  readonly method: string;
  readonly failure: string;
  readonly timestamp: string;
}

/** 单条 HTTP 状态码异常（≥400）诊断。 */
export interface HttpErrorDiagnostic {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly statusText: string;
  readonly timestamp: string;
}

/** 完整诊断报告。 */
export interface DiagnosticsReport {
  /** 是否无非预期的致命错误。 */
  readonly ok: boolean;
  /** 关联视图名称。 */
  readonly view?: string;
  /** 报告生成时间。 */
  readonly generatedAt: string;
  /** 严重错误数量（未被白名单忽略的 console errors, pageerrors, request failures, http errors）。 */
  readonly failureCount: number;
  /** 控制台错误。 */
  readonly consoleErrors: readonly ConsoleDiagnostic[];
  /** 控制台警告。 */
  readonly consoleWarnings: readonly ConsoleDiagnostic[];
  /** 页面 JS 异常。 */
  readonly pageErrors: readonly PageErrorDiagnostic[];
  /** 请求失败记录。 */
  readonly requestFailures: readonly RequestFailureDiagnostic[];
  /** HTTP ≥400 响应。 */
  readonly httpErrors: readonly HttpErrorDiagnostic[];
  /** 被白名单忽略的项。 */
  readonly ignored: readonly { readonly category: string; readonly pattern: string; readonly item: string }[];
}

/** 诊断收集器配置。 */
export interface DiagnosticsCollectorOptions {
  /** 关联的视图名称。 */
  readonly view?: string;
  /** 允许忽略的错误消息正则或字符串白名单。 */
  readonly ignorePatterns?: readonly (string | RegExp)[];
}

/** 诊断收集器接口。 */
export interface DiagnosticsCollector {
  /** 生成当前快照报告。 */
  readonly getReport: () => DiagnosticsReport;
  /** 是否存在未被忽略的失败。 */
  readonly hasFailures: () => boolean;
  /** 格式化为 JSON 字符串。 */
  readonly formatJson: () => string;
}

/**
 * 为指定 Playwright Page 挂载诊断收集监听。
 *
 * @param page - 目标页面。
 * @param options - 过滤与白名单配置。
 * @returns 诊断收集句柄。
 */
export function createDiagnosticsCollector(
  page: Page,
  options?: DiagnosticsCollectorOptions,
): DiagnosticsCollector {
  const consoleErrors: ConsoleDiagnostic[] = [];
  const consoleWarnings: ConsoleDiagnostic[] = [];
  const pageErrors: PageErrorDiagnostic[] = [];
  const requestFailures: RequestFailureDiagnostic[] = [];
  const httpErrors: HttpErrorDiagnostic[] = [];
  const ignored: { category: string; pattern: string; item: string }[] = [];

  const ignorePatterns = options?.ignorePatterns ?? [];

  function isIgnored(category: string, text: string): boolean {
    for (const pattern of ignorePatterns) {
      if (typeof pattern === "string" && text.includes(pattern)) {
        ignored.push({ category, pattern, item: text });
        return true;
      }
      if (pattern instanceof RegExp && pattern.test(text)) {
        ignored.push({ category, pattern: pattern.source, item: text });
        return true;
      }
    }
    return false;
  }

  // 1. Console 错误与警告
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    const timestamp = new Date().toISOString();
    const location = msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : undefined;

    if (type === "error") {
      const fullText = location ? `${text} at ${location}` : text;
      if (!isIgnored("console_error", text) && (!location || !isIgnored("console_error", location))) {
        consoleErrors.push({ type: "error", text, location, timestamp });
      }
    } else if (type === "warning") {
      consoleWarnings.push({ type: "warning", text, location, timestamp });
    }
  });

  // 2. 页面未捕获 JS 异常
  page.on("pageerror", (err) => {
    const message = err.message ?? String(err);
    const stack = err.stack;
    const timestamp = new Date().toISOString();

    if (!isIgnored("page_error", message)) {
      pageErrors.push({ message, stack, timestamp });
    }
  });

  // 3. 网络请求失败（主动终止/取消的 SSE 或 fetch 请求不计为失败）
  page.on("requestfailed", (req: Request) => {
    const failureText = req.failure()?.errorText ?? "unknown_failure";
    // 忽略主动 abort 的请求（如用户导航切走或组件卸载）
    if (failureText.includes("net::ERR_ABORTED") || failureText.includes("canceled")) {
      return;
    }
    const url = req.url();
    const timestamp = new Date().toISOString();

    if (!isIgnored("request_failure", `${url} (${failureText})`)) {
      requestFailures.push({
        url,
        method: req.method(),
        failure: failureText,
        timestamp,
      });
    }
  });

  // 4. HTTP 错误响应（≥400）
  page.on("response", (res: Response) => {
    const status = res.status();
    if (status >= 400) {
      const url = res.url();
      const statusText = res.statusText();
      const timestamp = new Date().toISOString();
      const summary = `${status} ${statusText} on ${url}`;

      if (!isIgnored("http_error", summary)) {
        httpErrors.push({
          url,
          method: res.request().method(),
          status,
          statusText,
          timestamp,
        });
      }
    }
  });

  const getReport = (): DiagnosticsReport => {
    const failureCount =
      consoleErrors.length + pageErrors.length + requestFailures.length + httpErrors.length;
    return {
      ok: failureCount === 0,
      view: options?.view,
      generatedAt: new Date().toISOString(),
      failureCount,
      consoleErrors,
      consoleWarnings,
      pageErrors,
      requestFailures,
      httpErrors,
      ignored,
    };
  };

  return {
    getReport,
    hasFailures: () => getReport().failureCount > 0,
    formatJson: () => JSON.stringify(getReport(), null, 2),
  };
}
