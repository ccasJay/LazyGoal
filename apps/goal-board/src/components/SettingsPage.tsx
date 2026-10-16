import { useCallback, useEffect, useMemo, useState } from "react";

import { browserApi, BrowserApiError } from "../api";
import type {
  BrowserProviderProfile,
  BrowserProviderProfileInput,
  BrowserProviderProfileTestResult,
  BrowserProviderSettings,
} from "../../../../packages/web-contracts/src/index";

const EMPTY_FORM = {
  label: "",
  kind: "openai",
  defaultModel: "",
  apiKey: "",
  baseURL: "",
  contextWindowTokens: "",
  maxOutputTokens: "",
  structuredOutputMode: "",
} as const;

type FormState = {
  label: string;
  kind: string;
  defaultModel: string;
  apiKey: string;
  baseURL: string;
  contextWindowTokens: string;
  maxOutputTokens: string;
  structuredOutputMode: string;
};

function toInput(form: FormState, editing: boolean): BrowserProviderProfileInput {
  const optionalNumber = (text: string): number | null | undefined => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return editing ? null : undefined;
    const value = Number(trimmed);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  return {
    label: form.label.trim(),
    kind: form.kind,
    defaultModel: form.defaultModel.trim(),
    // 编辑时空值表示保留原凭据；创建时由服务端校验拒绝缺失凭据。
    ...(form.apiKey.trim().length === 0 ? {} : { apiKey: form.apiKey.trim() }),
    baseURL: form.baseURL.trim().length === 0 ? (editing ? null : undefined) : form.baseURL.trim(),
    contextWindowTokens: optionalNumber(form.contextWindowTokens),
    maxOutputTokens: optionalNumber(form.maxOutputTokens),
    structuredOutputMode: form.structuredOutputMode.trim().length === 0
      ? (editing ? null : undefined)
      : (form.structuredOutputMode as BrowserProviderProfileInput["structuredOutputMode"]),
  };
}

function describeError(error: unknown): string {
  if (error instanceof BrowserApiError) return error.code;
  return "provider_profile_unavailable";
}

/**
 * 受管 Provider 设置的展示层。
 *
 * @remarks
 * 纯展示组件：只接收已投影的设置与回调，便于渲染测试。表单从不回显明文凭据；
 * 编辑时留空表示保留原凭据。
 *
 * @example
 * ```tsx
 * <ProviderSettingsSection settings={{ profiles: [] }} onCreate={async () => {}} />
 * ```
 */
export function ProviderSettingsSection(props: {
  readonly settings: BrowserProviderSettings;
  readonly busy?: boolean;
  readonly notice?: string | undefined;
  readonly error?: string | undefined;
  readonly testResults?: Readonly<Record<string, BrowserProviderProfileTestResult>>;
  readonly onCreate?: (input: BrowserProviderProfileInput) => void;
  readonly onUpdate?: (profileId: string, input: BrowserProviderProfileInput) => void;
  readonly onDelete?: (profileId: string) => void;
  readonly onActivate?: (profileId: string) => void;
  readonly onTest?: (profileId: string) => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const profiles = props.settings.profiles;
  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const editing = editingId !== null;

  const startEdit = (profile: BrowserProviderProfile) => {
    setEditingId(profile.id);
    setForm({
      label: profile.label,
      kind: profile.kind,
      defaultModel: profile.defaultModel,
      apiKey: "",
      baseURL: profile.baseURL ?? "",
      contextWindowTokens: profile.contextWindowTokens === undefined ? "" : String(profile.contextWindowTokens),
      maxOutputTokens: profile.maxOutputTokens === undefined ? "" : String(profile.maxOutputTokens),
      structuredOutputMode: profile.structuredOutputMode ?? "",
    });
  };

  return (
    <section className="settings-page" aria-labelledby="settings-page-title">
      <div className="settings-page-inner">
        <header className="settings-page-heading">
          <h2 id="settings-page-title">Providers</h2>
          <p>Save several provider credentials and switch between them without editing configuration files.</p>
        </header>

        {props.error !== undefined && <p className="settings-notice" role="alert">{props.error}</p>}
        {props.notice !== undefined && <p className="settings-notice" role="status">{props.notice}</p>}

        {props.settings.fallback !== undefined && (
          <div className="settings-fallback" data-testid="settings-fallback">
            <h3>Configuration fallback (read-only)</h3>
            <p>{props.settings.fallback.provider} · {props.settings.fallback.model}</p>
          </div>
        )}

        <ul className="settings-providers" data-testid="settings-providers">
          {profiles.map((profile) => (
            <li key={profile.id} data-testid={`settings-provider-${profile.id}`}>
              <div className="settings-provider-heading">
                <strong>{profile.label}</strong>
                <span>{profile.kind} · {profile.defaultModel}</span>
                {props.settings.activeProfileId === profile.id && <span className="settings-active">Active</span>}
              </div>
              <p className="settings-provider-key">
                {profile.hasApiKey ? profile.apiKeyMask : "No credential saved"}
              </p>
              {props.testResults?.[profile.id] !== undefined && (
                <p className="settings-provider-test">
                  {props.testResults[profile.id]?.ok === true
                    ? `${(props.testResults[profile.id] as { modelCount: number }).modelCount} models`
                    : String((props.testResults[profile.id] as { error: string }).error)}
                </p>
              )}
              <div className="settings-provider-actions">
                <button type="button" onClick={() => startEdit(profile)}>Edit</button>
                <button type="button" onClick={() => props.onTest?.(profile.id)}>Test connection</button>
                <button
                  type="button"
                  onClick={() => props.onActivate?.(profile.id)}
                  disabled={props.settings.activeProfileId === profile.id}
                >
                  Set active
                </button>
                <button
                  type="button"
                  onClick={() => props.onDelete?.(profile.id)}
                  disabled={props.settings.activeProfileId === profile.id}
                  title={props.settings.activeProfileId === profile.id ? "Active provider cannot be deleted" : undefined}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="settings-provider-form"
          data-testid="settings-provider-form"
          onSubmit={(event) => {
            event.preventDefault();
            const input = toInput(form, editing);
            if (editing && editingId !== null) props.onUpdate?.(editingId, input);
            else props.onCreate?.(input);
          }}
        >
          <h3>{editing ? "Edit provider" : "Add provider"}</h3>
          <label>Name<input value={form.label} onChange={(event) => update({ label: event.target.value })} required /></label>
          <label>
            Kind
            <select value={form.kind} onChange={(event) => update({ kind: event.target.value })}>
              {["openai", "google", "anthropic", "openrouter", "deepseek", "openai-compatible", "opencode-go"].map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>Default model<input value={form.defaultModel} onChange={(event) => update({ defaultModel: event.target.value })} required /></label>
          <label>
            API key
            <input
              type="password"
              value={form.apiKey}
              placeholder={editing ? "Unchanged" : ""}
              onChange={(event) => update({ apiKey: event.target.value })}
            />
          </label>
          <label>Base URL<input value={form.baseURL} onChange={(event) => update({ baseURL: event.target.value })} /></label>
          <label>Context window tokens<input value={form.contextWindowTokens} onChange={(event) => update({ contextWindowTokens: event.target.value })} /></label>
          <label>Max output tokens<input value={form.maxOutputTokens} onChange={(event) => update({ maxOutputTokens: event.target.value })} /></label>
          <label>
            Structured output mode
            <select value={form.structuredOutputMode} onChange={(event) => update({ structuredOutputMode: event.target.value })}>
              <option value="">Provider default</option>
              <option value="prompt_only">prompt_only</option>
              <option value="strict">strict</option>
              <option value="two_stage">two_stage</option>
            </select>
          </label>
          <div className="settings-provider-form-actions">
            <button type="submit" disabled={props.busy}>{editing ? "Save changes" : "Add provider"}</button>
            {editing && (
              <button type="button" onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

/**
 * 设置页容器：读取受管 Provider 设置并转发增删改与连接测试。
 *
 * @remarks
 * 依赖 `browserApi` 的本机会话令牌；失败以稳定错误码就地展示，不伪造成功。
 *
 * @example
 * ```tsx
 * <SettingsPage />
 * ```
 */
export function SettingsPage() {
  const [settings, setSettings] = useState<BrowserProviderSettings | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [testResults, setTestResults] = useState<Record<string, BrowserProviderProfileTestResult>>({});

  const reload = useCallback(async () => {
    try {
      const next = await browserApi.listProviders();
      setSettings(next);
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (
    action: () => Promise<void>,
    successNotice: string,
    goalNotice?: string,
  ) => {
    setBusy(true);
    try {
      await action();
      setError(undefined);
      setNotice(goalNotice ?? successNotice);
      await reload();
    } catch (cause) {
      setNotice(undefined);
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const handlers = useMemo(() => ({
    onCreate: (input: BrowserProviderProfileInput) => {
      void run(async () => { await browserApi.createProvider(input); }, "Provider added.");
    },
    onUpdate: (profileId: string, input: BrowserProviderProfileInput) => {
      void run(async () => { await browserApi.updateProvider(profileId, input); }, "Provider updated.");
    },
    onDelete: (profileId: string) => {
      void run(
        async () => { await browserApi.deleteProvider(profileId); },
        "Provider deleted.",
        "Provider deleted. Existing goals that used it will ask you to choose again on resume.",
      );
    },
    onActivate: (profileId: string) => {
      void run(async () => { await browserApi.activateProvider(profileId); }, "Active provider updated.");
    },
    onTest: (profileId: string) => {
      void run(async () => {
        const result = await browserApi.testProvider(profileId);
        setTestResults((current) => ({ ...current, [profileId]: result }));
      }, "Connection tested.");
    },
  }), [run]);

  if (settings === undefined) {
    return (
      <section className="settings-page" aria-labelledby="settings-page-title">
        <div className="settings-page-inner">
          <header className="settings-page-heading">
            <h2 id="settings-page-title">Providers</h2>
            <p>{error ?? "Loading providers…"}</p>
          </header>
        </div>
      </section>
    );
  }

  return (
    <ProviderSettingsSection
      settings={settings}
      busy={busy}
      notice={notice}
      error={error}
      testResults={testResults}
      {...handlers}
    />
  );
}
