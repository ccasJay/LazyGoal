import { FieldLegend, FieldSet } from "./ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { NativeSelect } from "./ui/native-select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { MoreHorizontal, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

import { browserApi, BrowserApiError } from "../api";
import type {
  BrowserProviderModelQuery,
  BrowserProviderModels,
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
} as const;

type FormState = {
  label: string;
  kind: string;
  defaultModel: string;
  apiKey: string;
  baseURL: string;
  contextWindowTokens: string;
  maxOutputTokens: string;
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
  };
}

function describeError(error: unknown): string {
  if (error instanceof BrowserApiError) return error.code;
  return "provider_profile_unavailable";
}

const PROVIDERS = [
  ["openai", "OpenAI"], ["google", "Google"], ["anthropic", "Anthropic"],
  ["openrouter", "OpenRouter"], ["deepseek", "DeepSeek"], ["opencode-go", "OpenCode Go"],
] as const;
const PROVIDERS_SECTION = {
  value: "providers",
  label: "Providers",
  title: "Providers",
  description: "Manage your model connections.",
} as const;
type ActivityWidth = "standard" | "wide";
const CONFIG_PROVIDER_LABEL = "CPA";
const providerName = (kind: string) => PROVIDERS.find(([id]) => id === kind)?.[1] ?? (kind === "openai-compatible" ? "Custom API" : kind);
type WriteResult = void | Promise<boolean | void>;

type SettingsSectionDefinition = {
  readonly value: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly content: ReactNode;
};

function SettingsLayout(props: { readonly sections: readonly [SettingsSectionDefinition, ...SettingsSectionDefinition[]] }) {
  const settingsId = useId();
  const [activeSection, setActiveSection] = useState(props.sections[0].value);

  return (
    <section className="settings-page" aria-labelledby={`${settingsId}-${activeSection}-title`}>
      <Tabs className="settings-tabs" value={activeSection} onValueChange={setActiveSection}>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings">
            <TabsList aria-label="Settings sections">
              {props.sections.map(section => <TabsTrigger
                key={section.value}
                value={section.value}
                id={`${settingsId}-${section.value}-tab`}
                aria-controls={`${settingsId}-${section.value}-panel`}
              >{section.label}</TabsTrigger>)}
            </TabsList>
          </nav>
          {props.sections.map(section => <TabsContent
            key={section.value}
            className="settings-page-inner"
            value={section.value}
            id={`${settingsId}-${section.value}-panel`}
            aria-labelledby={`${settingsId}-${section.value}-tab`}
          >
            <header className="settings-page-heading">
              <div><h2 id={`${settingsId}-${section.value}-title`}>{section.title}</h2><p>{section.description}</p></div>
              {section.action}
            </header>
            {section.content}
          </TabsContent>)}
        </div>
      </Tabs>
    </section>
  );
}

/**
 * 受管 Provider 设置的展示层。
 *
 * @remarks
 * 纯展示组件：只接收已投影的设置与回调，便于渲染测试。表单从不回显明文凭据；
 * 编辑时留空表示保留原凭据。创建和更新回调返回 true 后关闭编辑器；失败保留草稿。
 * Provider 设置尚未加载时仍可查看外观设置。
 *
 * @example
 * ```tsx
 * <ProviderSettingsSection settings={{ profiles: [] }} onCreate={async () => true} />
 * ```
 */
export function ProviderSettingsSection(props: {
  readonly settings?: BrowserProviderSettings;
  readonly busy?: boolean;
  readonly notice?: string | undefined;
  readonly error?: string | undefined;
  readonly testResults?: Readonly<Record<string, BrowserProviderProfileTestResult>>;
  /** 只读查询当前表单的在线模型；不保存输入，支持取消。 */
  readonly onFetchModels?: (input: BrowserProviderModelQuery, signal: AbortSignal) => Promise<BrowserProviderModels>;
  readonly onCreate?: (input: BrowserProviderProfileInput) => WriteResult;
  readonly onUpdate?: (profileId: string, input: BrowserProviderProfileInput) => WriteResult;
  readonly onDelete?: (profileId: string) => void;
  readonly onActivate?: (profileId: string) => void;
  readonly onTest?: (profileId: string) => void;
  /** 会话活动区和输入框的本地显示偏好。 */
  readonly appearance?: {
    readonly activityWidth: ActivityWidth;
    readonly onActivityWidthChange: (width: ActivityWidth) => void;
    readonly saveError?: string | undefined;
  };
}) {
  const modelInputId = useId();
  const widthId = useId();
  const settings = props.settings;
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [editor, setEditor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const [models, setModels] = useState<BrowserProviderModels["models"] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualModelEntry, setManualModelEntry] = useState(false);
  const modelRequest = useRef<AbortController | null>(null);
  useEffect(() => () => modelRequest.current?.abort(), []);
  const cancelFetch = () => {
    modelRequest.current?.abort();
    modelRequest.current = null;
    setFetching(false);
    setModels(null);
    setFetchError(null);
    setManualModelEntry(false);
  };
  const editing = editor !== null && editor !== "create";
  const custom = form.kind === "openai-compatible";
  const update = (patch: Partial<FormState>) => {
    if (patch.kind !== undefined || patch.apiKey !== undefined || patch.baseURL !== undefined) cancelFetch();
    setForm(current => ({ ...current, ...patch }));
  };
  const fetchModels = async () => {
    if (!props.onFetchModels || fetching) return;
    cancelFetch();
    const controller = new AbortController();
    modelRequest.current = controller;
    setFetching(true);
    try {
      const result = await props.onFetchModels({
        kind: form.kind,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        ...(form.baseURL.trim() ? { baseURL: form.baseURL.trim() } : {}),
        ...(editing && editor !== null ? { profileId: editor } : {}),
      }, controller.signal);
      if (!controller.signal.aborted && modelRequest.current === controller) {
        setModels([...new Map(result.models.map(model => [model.id, model])).values()].sort((a, b) => a.id.localeCompare(b.id)));
      }
    } catch (error) {
      if (!controller.signal.aborted && modelRequest.current === controller) setFetchError(describeError(error));
    } finally {
      if (modelRequest.current === controller) { modelRequest.current = null; setFetching(false); }
    }
  };
  const closeEditor = () => {
    cancelFetch();
    setEditor(null);
    setForm({ ...EMPTY_FORM });
  };

  const startEdit = (profile: BrowserProviderProfile) => {
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelFetch();
    setDeleting(null);
    setEditor(profile.id);
    setForm({
      label: profile.label, kind: profile.kind, defaultModel: profile.defaultModel, apiKey: "",
      baseURL: profile.baseURL ?? "",
      contextWindowTokens: profile.contextWindowTokens === undefined ? "" : String(profile.contextWindowTokens),
      maxOutputTokens: profile.maxOutputTokens === undefined ? "" : String(profile.maxOutputTokens),
    });
  };

  const editorForm = (
    <form ref={formRef} className="settings-provider-form" data-testid="settings-provider-form"
      aria-label={editing ? "Edit provider" : "Add provider"}
      onSubmit={async event => {
        event.preventDefault();
        if (props.busy || fetching) return;
        const input = toInput(form, editing);
        const saved = editing && editor !== null
          ? await props.onUpdate?.(editor, input) : await props.onCreate?.(input);
        if (saved === true) closeEditor();
      }}>
      <FieldSet disabled={props.busy}>
        <div className="settings-editor-heading">
          <h3 id={`${modelInputId}-dialog-title`}>{editing ? "Edit provider" : "Add provider"}</h3>
          <Button variant="ghost" size="sm" type="button" className="icon" aria-label="Close provider editor" onClick={closeEditor}><X size={16} /></Button>
        </div>
        {!editing && <div className="settings-add-modes" role="group" aria-label="Provider type">
          <Button variant="ghost" size="sm" type="button" aria-pressed={!custom} onClick={() => update({ kind: "openai", baseURL: "" })}>Built-in provider</Button>
          <Button variant="ghost" size="sm" type="button" aria-pressed={custom} onClick={() => update({ kind: "openai-compatible" })}>Custom API</Button>
        </div>}
        {!editing && <p className="settings-form-hint">{custom ? "Connect an OpenAI-compatible endpoint or a self-hosted model." : "Use a supported provider with your own API key."}</p>}
        <Label>Name<Input value={form.label} onChange={event => update({ label: event.target.value })} placeholder="e.g. Personal account" required /></Label>
        {!custom && <Label>Provider<NativeSelect value={form.kind} onChange={event => update({ kind: event.target.value })}>
          {PROVIDERS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </NativeSelect></Label>}
        {custom && <Label>API URL<Input type="url" value={form.baseURL} placeholder="https://gateway.example/v1" onChange={event => update({ baseURL: event.target.value })} required /></Label>}
        <Label>API key<Input type="password" autoComplete="new-password" value={form.apiKey} placeholder={editing ? "Leave blank to keep the saved key" : "Enter your API key"} required={!editing} onChange={event => update({ apiKey: event.target.value })} /></Label>
        <div className="settings-model-field">
          <div className="settings-model-label">
            <Label htmlFor={modelInputId}>Default model</Label>
            <Button variant="ghost" size="sm" type="button" className="settings-fetch-models" disabled={fetching || !props.onFetchModels || (!editing && !form.apiKey.trim()) || (custom && !form.baseURL.trim())} onClick={() => void fetchModels()}>{fetching ? "Fetching…" : "Fetch models"}</Button>
          </div>
          {models !== null && models.length > 0 && !manualModelEntry ? <NativeSelect id={modelInputId} value={form.defaultModel} onChange={event => update({ defaultModel: event.target.value })} required>
            {!form.defaultModel && <option value="" disabled>Select a model ({models.length} available)</option>}
            {form.defaultModel && !models.some(model => model.id === form.defaultModel) && <option value={form.defaultModel}>Current model: {form.defaultModel}</option>}
            {models.map(model => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}
          </NativeSelect> : <Input id={modelInputId} value={form.defaultModel} placeholder="Model ID" onChange={event => update({ defaultModel: event.target.value })} required />}
          {models !== null && models.length > 0 && <Button variant="ghost" size="sm" type="button" className="settings-manual-model" onClick={() => setManualModelEntry(value => !value)}>{manualModelEntry ? "Choose a fetched model" : "Enter model ID manually"}</Button>}
        </div>
        <div className="settings-model-results" aria-live="polite" aria-busy={fetching}>
          {fetchError && <p className="settings-test-error" role="alert">Could not fetch models ({fetchError}). Check the provider, API key and URL.</p>}
          {models !== null && models.length === 0 && <p>No models returned. You can enter a model ID manually.</p>}
        </div>
        <Collapsible className="settings-advanced" key={editor}>
          <CollapsibleTrigger>Advanced</CollapsibleTrigger><CollapsibleContent>
          <div className="settings-capacities">
            <Label>Context window tokens<Input type="number" min="1" step="1" value={form.contextWindowTokens} onChange={event => update({ contextWindowTokens: event.target.value })} /></Label>
            <Label>Max output tokens<Input type="number" min="1" step="1" value={form.maxOutputTokens} onChange={event => update({ maxOutputTokens: event.target.value })} /></Label>
          </div>
        </CollapsibleContent></Collapsible>
        <div className="settings-provider-form-actions">
          <Button variant="ghost" size="sm" type="button" className="secondary" onClick={closeEditor}>Cancel</Button>
          <Button variant="ghost" size="sm" type="submit" className="primary" disabled={fetching}>{props.busy ? "Saving…" : editing ? "Save changes" : "Add provider"}</Button>
        </div>
      </FieldSet>
    </form>
  );

  return (
    <>
      <SettingsLayout sections={[{
        ...PROVIDERS_SECTION,
        action: settings === undefined ? undefined : <Button variant="ghost" size="sm" type="button" className="primary settings-add-provider" disabled={props.busy} onClick={event => { editorOpener.current = event.currentTarget; cancelFetch(); setDeleting(null); setForm({ ...EMPTY_FORM }); setEditor("create"); }}><Plus size={16} />Add provider</Button>,
        content: (
          settings === undefined ? <p className={`settings-notice${props.error ? " settings-error" : ""}`} role={props.error ? "alert" : "status"}>{props.error ?? "Loading providers…"}</p> : <>
            {props.error !== undefined && <p className="settings-notice settings-error" role="alert">{props.error}</p>}
            {props.notice !== undefined && <p className="settings-notice" role="status">{props.notice}</p>}
        <ul className="settings-providers" data-testid="settings-providers">
          {settings.fallback !== undefined && !settings.profiles.some(profile =>
            profile.label === CONFIG_PROVIDER_LABEL
            && profile.kind === settings.fallback?.provider
            && profile.defaultModel === settings.fallback?.model
          ) && <li className="settings-config-row" data-testid="settings-fallback">
            <div className="settings-provider-row">
              <div className="settings-provider-identity"><strong>{CONFIG_PROVIDER_LABEL}</strong><p>{providerName(settings.fallback.provider)}, {settings.fallback.model}</p></div>
              <span className="settings-source">From configuration<span>Read-only</span></span>
            </div>
          </li>}
          {settings.profiles.map(profile => {
            const active = settings.activeProfileId === profile.id;
            const result = props.testResults?.[profile.id];
            return <li key={profile.id} className="settings-provider-card" data-testid={`settings-provider-${profile.id}`}>
              <div className="settings-provider-row">
                <div className="settings-provider-identity">
                  <div className="settings-provider-heading"><strong>{profile.label}</strong>
                    <span className={`settings-key-dot ${profile.hasApiKey ? "is-saved" : "is-missing"}`} role="img" aria-label={profile.hasApiKey ? "Credential saved" : "No credential saved"} title={profile.hasApiKey ? "Credential saved" : "No credential saved"} />
                    {profile.kind === "openai-compatible" && <span className="settings-custom">Custom</span>}
                  </div>
                  <p>{providerName(profile.kind)}, {profile.defaultModel}</p>
                </div>
                <div className="settings-provider-actions">
                  {active && <span className="settings-active">Active</span>}
                  <Button variant="ghost" size="sm" type="button" className="secondary" aria-haspopup="dialog" aria-label={`Edit ${profile.label}`} disabled={props.busy} onClick={() => startEdit(profile)}>Edit</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`More options for ${profile.label}`}><MoreHorizontal size={18} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={props.busy} onSelect={() => props.onTest?.(profile.id)}>Check model catalog</DropdownMenuItem>
                      <DropdownMenuItem disabled={props.busy || active} onSelect={() => props.onActivate?.(profile.id)}>Set active</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" disabled={props.busy || active} onSelect={() => setDeleting(profile.id)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {result && <p className={`settings-provider-test ${result.ok ? "" : "settings-test-error"}`} role="status">{result.ok ? `Model catalog available, ${result.modelCount} models` : `Model catalog check failed: ${result.error}`}</p>}
              {deleting === profile.id && <div className="settings-delete-confirm" role="group" aria-label={`Delete ${profile.label}`}>
                <p>Delete this provider? Goals using it will need another provider on resume.</p>
                <div><Button variant="ghost" size="sm" type="button" className="secondary" disabled={props.busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="ghost" size="sm" type="button" className="secondary settings-delete" disabled={props.busy} onClick={() => { setDeleting(null); props.onDelete?.(profile.id); }}>Delete provider</Button></div>
              </div>}
            </li>;
          })}
        </ul>
          </>
        ),
      }, ...(props.appearance === undefined ? [] : [{
        value: "appearance",
        label: "Appearance",
        title: "Appearance",
        description: "Adjust the Activity view.",
        content: <FieldSet className="settings-activity-width">
          <FieldLegend id={`${widthId}-label`} variant="label">Activity width</FieldLegend>
          <p id={`${widthId}-description`}>Applies to Activity and the message input in this browser.</p>
          <RadioGroup aria-labelledby={`${widthId}-label`} aria-describedby={`${widthId}-description`} value={props.appearance.activityWidth} onValueChange={value => {
            if (value === "standard" || value === "wide") props.appearance?.onActivityWidthChange(value);
          }}>
            <div><RadioGroupItem id={`${widthId}-standard`} value="standard" /><Label htmlFor={`${widthId}-standard`}>Standard</Label></div>
            <div><RadioGroupItem id={`${widthId}-wide`} value="wide" /><Label htmlFor={`${widthId}-wide`}>Wide</Label></div>
          </RadioGroup>
          {props.appearance.saveError && <p className="settings-error" role="alert">{props.appearance.saveError}</p>}
        </FieldSet>,
      }])]} />
      <Dialog open={editor !== null} onOpenChange={open => { if (!open) closeEditor(); }}>
        <DialogContent showCloseButton={false} className="settings-provider-dialog" aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); editorOpener.current?.focus(); }}>
          <DialogTitle className="sr-only">{editing ? "Edit provider" : "Add provider"}</DialogTitle>
          {editor !== null && editorForm}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 设置页容器：读取受管 Provider 设置，并管理会话的显示偏好。
 *
 * @remarks
 * Provider 操作依赖 `browserApi` 的本机会话令牌；失败以稳定错误码就地展示。
 * 显示偏好由外层持有，Provider 加载失败不影响调整。
 *
 * @example
 * ```tsx
 * <SettingsPage activityWidth="standard" onActivityWidthChange={() => {}} />
 * ```
 */
export function SettingsPage(props: {
  readonly activityWidth: ActivityWidth;
  readonly onActivityWidthChange: (width: ActivityWidth) => void;
  readonly widthSaveError?: string | undefined;
}) {
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
      return true;
    } catch (cause) {
      setNotice(undefined);
      setError(describeError(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const handlers = useMemo(() => ({
    onCreate: (input: BrowserProviderProfileInput) => {
      return run(async () => { await browserApi.createProvider(input); }, "Provider added.");
    },
    onUpdate: (profileId: string, input: BrowserProviderProfileInput) => {
      return run(async () => {
        await browserApi.updateProvider(profileId, input);
        setTestResults(current => { const next = { ...current }; delete next[profileId]; return next; });
      }, "Provider updated.");
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
      }, "Model catalog checked.");
    },
  }), [run]);

  return (
    <ProviderSettingsSection
      settings={settings}
      appearance={{ activityWidth: props.activityWidth, onActivityWidthChange: props.onActivityWidthChange, saveError: props.widthSaveError }}
      busy={busy}
      notice={notice}
      error={error}
      testResults={testResults}
      onFetchModels={(input, signal) => browserApi.fetchProviderModels(input, signal)}
      {...handlers}
    />
  );
}
