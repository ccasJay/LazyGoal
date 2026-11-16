import { Button } from "./ui/button";
import { FieldSet } from "./ui/field";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Search } from "lucide-react";

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
type ActivityWidth = "standard" | "wide";
const CONFIG_PROVIDER_LABEL = "CPA";
const providerName = (kind: string) => PROVIDERS.find(([id]) => id === kind)?.[1] ?? (kind === "openai-compatible" ? "Custom API" : kind);
type WriteResult = void | Promise<boolean | void>;

type ProviderView =
  | { readonly kind: "list" }
  | { readonly kind: "edit"; readonly profileId: string; readonly label: string }
  | { readonly kind: "create" };

type SettingsSectionDefinition = {
  readonly value: string;
  readonly label: string;
  /** 当前搜索词命中的行数；为零的分区在筛选时从侧栏隐藏。 */
  readonly matchCount: number;
  /** 该分区是否存在可筛选的行；表单页没有可筛选的行。 */
  readonly searchable: boolean;
  readonly content: ReactNode;
  readonly footer?: ReactNode;
};

/** 设置分组标题；与相邻设置行共同表达层级，不额外添加说明。 */
function SettingsGroup(props: { readonly label: string }) {
  return <div className="settings-group">{props.label}</div>;
}

/**
 * 单条设置：左侧标题与说明，右侧控件。
 *
 * @remarks
 * `htmlFor` 让标题成为控件的标签；`titleId` 供 `aria-labelledby` 等外部引用。
 */
function SettingsRow(props: {
  readonly title: ReactNode;
  readonly titleId?: string;
  readonly htmlFor?: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-title" id={props.titleId}>
          {props.htmlFor === undefined ? props.title : <label htmlFor={props.htmlFor}>{props.title}</label>}
        </div>
        {props.description !== undefined && <p className="settings-row-desc">{props.description}</p>}
      </div>
      {props.children !== undefined && <div className="settings-row-control">{props.children}</div>}
    </div>
  );
}

/** 设置弹窗的两栏外壳：侧栏负责分区导航与筛选，内容区负责滚动与固定操作栏。 */
function SettingsLayout(props: {
  readonly navSections: readonly SettingsSectionDefinition[];
  readonly activeSection: SettingsSectionDefinition | undefined;
  readonly onSelectSection: (value: string) => void;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly searchable: boolean;
}) {
  return (
    <div className="settings-page">
      <aside className="settings-side">
        {props.searchable && <div className="settings-search">
          <Search size={13} aria-hidden="true" />
          <input type="search" value={props.query} placeholder="Search settings" aria-label="Search settings"
            onChange={event => props.onQueryChange(event.target.value)} />
        </div>}
        <nav className="settings-nav" aria-label="Settings">
          {props.navSections.map(section => <button
            key={section.value}
            type="button"
            aria-current={props.activeSection?.value === section.value ? "page" : undefined}
            onClick={() => props.onSelectSection(section.value)}
          >{section.label}</button>)}
        </nav>
        <div className="settings-side-foot"><kbd>Esc</kbd><span>Close settings</span></div>
      </aside>
      <div className="settings-content">
        {props.activeSection === undefined
          ? <div className="settings-scroll"><p className="settings-empty-note">No settings match this search.</p></div>
          : <>
            <div className="settings-scroll">{props.activeSection.content}</div>
            {props.activeSection.footer !== undefined && <div className="settings-foot">{props.activeSection.footer}</div>}
          </>}
      </div>
    </div>
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
  /** 关闭承载设置的弹窗；未提供时不显示 Done。 */
  readonly onClose?: () => void;
  /** 会话活动区和输入框的本地显示偏好。 */
  readonly appearance?: {
    readonly activityWidth: ActivityWidth;
    readonly onActivityWidthChange: (width: ActivityWidth) => void;
    readonly saveError?: string | undefined;
  };
}) {
  const fieldId = useId();
  const widthId = useId();
  const settings = props.settings;
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [view, setView] = useState<ProviderView>({ kind: "list" });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [section, setSection] = useState("providers");
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<BrowserProviderModels["models"] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualModelEntry, setManualModelEntry] = useState(false);
  const modelRequest = useRef<AbortController | null>(null);
  useEffect(() => () => modelRequest.current?.abort(), []);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (text: string) => normalizedQuery.length === 0 || text.toLowerCase().includes(normalizedQuery);
  const editing = view.kind === "edit";
  const creating = view.kind === "create";
  const editProfile = view.kind === "edit" ? settings?.profiles.find(profile => profile.id === view.profileId) : undefined;
  const activeProfileId = settings?.activeProfileId;
  const editingActive = view.kind === "edit" && activeProfileId === view.profileId;
  const custom = form.kind === "openai-compatible";

  const cancelFetch = () => {
    modelRequest.current?.abort();
    modelRequest.current = null;
    setFetching(false);
    setModels(null);
    setFetchError(null);
    setManualModelEntry(false);
  };
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
        ...(view.kind === "edit" ? { profileId: view.profileId } : {}),
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
    setRevealed(false);
    setDeleting(null);
    setView({ kind: "list" });
    setForm({ ...EMPTY_FORM });
  };
  const openCreate = () => {
    cancelFetch();
    setQuery("");
    setRevealed(false);
    setDeleting(null);
    setForm({ ...EMPTY_FORM });
    setView({ kind: "create" });
  };
  const startEdit = (profile: BrowserProviderProfile) => {
    cancelFetch();
    setQuery("");
    setRevealed(false);
    setDeleting(null);
    setView({ kind: "edit", profileId: profile.id, label: profile.label });
    setForm({
      label: profile.label, kind: profile.kind, defaultModel: profile.defaultModel, apiKey: "",
      baseURL: profile.baseURL ?? "",
      contextWindowTokens: profile.contextWindowTokens === undefined ? "" : String(profile.contextWindowTokens),
      maxOutputTokens: profile.maxOutputTokens === undefined ? "" : String(profile.maxOutputTokens),
    });
  };
  const selectSection = (value: string) => {
    setSection(value);
    setQuery("");
    if (value !== "providers") { cancelFetch(); setDeleting(null); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.busy || fetching) return;
    const input = toInput(form, editing);
    const saved = view.kind === "edit"
      ? await props.onUpdate?.(view.profileId, input) : await props.onCreate?.(input);
    if (saved === true) closeEditor();
  };

  const formId = `${fieldId}-provider-form`;
  const nameId = `${fieldId}-name`;
  const kindId = `${fieldId}-kind`;
  const urlId = `${fieldId}-url`;
  const keyId = `${fieldId}-key`;
  const modelId = `${fieldId}-model`;
  const contextId = `${fieldId}-context`;
  const outputId = `${fieldId}-output`;

  const fetchedModels = models !== null && models.length > 0;
  const selectModels = fetchedModels && !manualModelEntry;
  const modelStatus = fetching ? "Fetching the model list…"
    : fetchError !== null ? `Could not fetch models (${fetchError}). Check the provider, API key and URL.`
      : models !== null ? (models.length === 0 ? "No models returned. Enter a model ID manually." : `${models.length} models reported by this provider.`)
        : "Not fetched yet.";

  const connectionStatus = (() => {
    if (view.kind !== "edit") return "Not checked yet.";
    const result = props.testResults?.[view.profileId];
    if (result === undefined) return "Not checked yet.";
    return result.ok ? `Model catalog available, ${result.modelCount} models` : `Model catalog check failed: ${result.error}`;
  })();

  const providerForm = (
    <form id={formId} className="settings-provider-form" data-testid="settings-provider-form"
      aria-label={editing ? "Edit provider" : "Add provider"} onSubmit={submit}>
      <button className="settings-back" type="button" onClick={closeEditor}>
        <ChevronLeft size={13} aria-hidden="true" />Providers
      </button>
      <h3 className="settings-page-title">{editing ? view.label : "Add provider"}</h3>
      <FieldSet className="settings-fields" disabled={props.busy}>
        {creating && <>
          <SettingsGroup label="Kind" />
          <SettingsRow title="Provider type"
            description="Built-in providers use a known endpoint. Custom API connects an OpenAI-compatible URL.">
            <div className="settings-segmented" role="group" aria-label="Provider type">
              <button type="button" aria-pressed={!custom} onClick={() => update({ kind: "openai", baseURL: "" })}>Built-in</button>
              <button type="button" aria-pressed={custom} onClick={() => update({ kind: "openai-compatible" })}>Custom API</button>
            </div>
          </SettingsRow>
        </>}

        {editing && <>
          <SettingsGroup label="General" />
          <SettingsRow title="Active provider" description="New Goals start with this connection.">
            {editingActive
              ? <span className="settings-active">Active</span>
              : <Button variant="ghost" size="sm" type="button" className="secondary" disabled={props.busy || props.onActivate === undefined}
                onClick={() => { if (view.kind === "edit") props.onActivate?.(view.profileId); }}>Set as active</Button>}
          </SettingsRow>
        </>}

        <SettingsGroup label="Connection" />
        <SettingsRow title="Name" htmlFor={nameId}>
          <Input id={nameId} className="settings-input" value={form.label} placeholder="e.g. Personal account" required
            onChange={event => update({ label: event.target.value })} />
        </SettingsRow>
        {!custom && <SettingsRow title="Provider" htmlFor={kindId}>
          <NativeSelect id={kindId} value={form.kind} onChange={event => update({ kind: event.target.value })}>
            {PROVIDERS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </NativeSelect>
        </SettingsRow>}
        {custom && <SettingsRow title="API URL" htmlFor={urlId} description="OpenAI-compatible base URL for this endpoint.">
          <Input id={urlId} className="settings-input" type="url" value={form.baseURL} placeholder="https://gateway.example/v1"
            required onChange={event => update({ baseURL: event.target.value })} />
        </SettingsRow>}
        <SettingsRow title="API key" htmlFor={keyId}
          description={editing
            ? (editProfile?.hasApiKey === false ? "No key is saved. Enter one to use this provider." : "A key is saved. Leave blank to keep it.")
            : "Stored in this workspace only. Never shown again after saving."}>
          <div className="settings-key-field">
            <input id={keyId} type={revealed ? "text" : "password"} autoComplete="new-password" value={form.apiKey}
              placeholder={editing ? "" : "Enter your API key"} required={!editing}
              onChange={event => update({ apiKey: event.target.value })} />
            <Button variant="ghost" size="icon" type="button" className="settings-reveal"
              aria-label={revealed ? "Hide API key" : "Show API key"} aria-pressed={revealed}
              onClick={() => setRevealed(value => !value)}>
              {revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            </Button>
          </div>
        </SettingsRow>

        <SettingsGroup label="Model" />
        <SettingsRow title="Default model" htmlFor={modelId}
          description={editing ? "Used when this provider is active." : "Fetch the list after entering a key, or type the model ID."}>
          {selectModels
            ? <NativeSelect id={modelId} value={form.defaultModel} required onChange={event => update({ defaultModel: event.target.value })}>
              {!form.defaultModel && <option value="" disabled>Select a model ({models.length} available)</option>}
              {form.defaultModel && !models.some(model => model.id === form.defaultModel) && <option value={form.defaultModel}>Current model: {form.defaultModel}</option>}
              {models.map(model => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}
            </NativeSelect>
            : <Input id={modelId} className="settings-input" value={form.defaultModel} placeholder="Model ID" required
              onChange={event => update({ defaultModel: event.target.value })} />}
        </SettingsRow>
        <SettingsRow title="Model list" description={<span role="status">{modelStatus}</span>}>
          {fetchedModels && <Button variant="ghost" size="sm" type="button" className="secondary"
            onClick={() => setManualModelEntry(value => !value)}>{manualModelEntry ? "Choose a fetched model" : "Enter model ID manually"}</Button>}
          <Button variant="ghost" size="sm" type="button" className="secondary"
            disabled={fetching || !props.onFetchModels || (!editing && !form.apiKey.trim()) || (custom && !form.baseURL.trim())}
            onClick={() => void fetchModels()}>{fetching ? "Fetching…" : "Fetch models"}</Button>
        </SettingsRow>

        <SettingsGroup label="Capacity" />
        <SettingsRow title="Context window tokens" htmlFor={contextId}
          description={custom ? "Required for Custom API. Built-in providers read this from the catalog." : "Used for context budgeting."}>
          <Input id={contextId} className="settings-input settings-input-narrow" type="text" inputMode="numeric"
            pattern="[0-9]*" autoComplete="off" value={form.contextWindowTokens}
            onChange={event => update({ contextWindowTokens: event.target.value })} />
        </SettingsRow>
        <SettingsRow title="Max output tokens" htmlFor={outputId} description="Upper bound for a single model reply.">
          <Input id={outputId} className="settings-input settings-input-narrow" type="text" inputMode="numeric"
            pattern="[0-9]*" autoComplete="off" value={form.maxOutputTokens}
            onChange={event => update({ maxOutputTokens: event.target.value })} />
        </SettingsRow>

        {editing && <>
          <SettingsGroup label="Status" />
          <SettingsRow title="Connection check" description={<span role="status">{connectionStatus}</span>}>
            <Button variant="ghost" size="sm" type="button" className="secondary" disabled={props.busy || props.onTest === undefined}
              onClick={() => { if (view.kind === "edit") props.onTest?.(view.profileId); }}>Check again</Button>
          </SettingsRow>
        </>}
      </FieldSet>
    </form>
  );

  const formFooter = (() => {
    if (deleting !== null) return <div className="settings-foot-confirm" role="group" aria-label="Delete provider">
      <p>Delete this provider? Goals using it will need another provider on resume.</p>
      <span className="settings-foot-spacer" />
      <Button variant="ghost" size="sm" type="button" className="secondary" disabled={props.busy}
        onClick={() => setDeleting(null)}>Cancel</Button>
      <Button variant="ghost" size="sm" type="button" className="secondary settings-delete" disabled={props.busy}
        onClick={() => { const target = deleting; setDeleting(null); closeEditor(); props.onDelete?.(target); }}>Delete provider</Button>
    </div>;
    if (editing) return <>
      <Button variant="ghost" size="sm" type="button" className="secondary settings-delete"
        disabled={props.busy || editingActive}
        onClick={() => { if (view.kind === "edit") setDeleting(view.profileId); }}>Delete</Button>
      {editingActive && <span className="settings-foot-note">A different provider must be active before this one can be deleted.</span>}
      <span className="settings-foot-spacer" />
      <Button variant="ghost" size="sm" type="button" className="secondary" onClick={closeEditor}>Cancel</Button>
      <Button variant="ghost" size="sm" type="submit" form={formId} className="primary" disabled={fetching}>
        {props.busy ? "Saving…" : "Save changes"}</Button>
    </>;
    return <>
      <span className="settings-foot-spacer" />
      <Button variant="ghost" size="sm" type="button" className="secondary" onClick={closeEditor}>Cancel</Button>
      <Button variant="ghost" size="sm" type="submit" form={formId} className="primary" disabled={fetching}>
        {props.busy ? "Saving…" : "Add provider"}</Button>
    </>;
  })();

  const showFallbackRow = settings !== undefined && settings.fallback !== undefined && !settings.profiles.some(profile =>
    profile.label === CONFIG_PROVIDER_LABEL
    && profile.kind === settings.fallback?.provider
    && profile.defaultModel === settings.fallback?.model
  );
  const visibleProfiles = settings === undefined ? [] : settings.profiles.filter(profile =>
    matches([profile.label, profile.kind, providerName(profile.kind), profile.defaultModel].join(" ")));
  const fallbackVisible = showFallbackRow && matches([
    CONFIG_PROVIDER_LABEL, "configuration read-only",
    settings?.fallback?.provider ?? "", providerName(settings?.fallback?.provider ?? ""), settings?.fallback?.model ?? "",
  ].join(" "));
  const providerRowCount = visibleProfiles.length + (fallbackVisible ? 1 : 0);

  const providerList = <>
    {props.error !== undefined && <p className="settings-notice settings-error" role="alert">{props.error}</p>}
    {props.notice !== undefined && <p className="settings-notice" role="status">{props.notice}</p>}
    {settings === undefined
      ? <p className="settings-notice" role={props.error ? "alert" : "status"}>{props.error ?? "Loading providers…"}</p>
      : <>
        <h3 className="settings-page-title">Providers</h3>
        <p className="settings-page-sub">Model connections in this workspace. New Goals use the active provider.</p>
        <div className="settings-group">
          <span>Model connections</span>
          <Button variant="ghost" size="sm" type="button" className="primary" disabled={props.busy} onClick={openCreate}>
            <Plus size={14} aria-hidden="true" />Add provider</Button>
        </div>
        <ul className="settings-providers" data-testid="settings-providers">
          {showFallbackRow && fallbackVisible && <li className="settings-config-row" data-testid="settings-fallback">
            <div className="settings-row settings-provider-row">
              <div className="settings-row-main">
                <div className="settings-provider-heading">
                  <strong>{CONFIG_PROVIDER_LABEL}</strong>
                  <span className="settings-custom">Read-only</span>
                </div>
                <p className="settings-row-desc">{providerName(settings.fallback?.provider ?? "")}, {settings.fallback?.model}</p>
                <p className="settings-source-note">From configuration</p>
              </div>
            </div>
          </li>}
          {visibleProfiles.map(profile => {
            const active = settings.activeProfileId === profile.id;
            const result = props.testResults?.[profile.id];
            return <li key={profile.id} className="settings-provider-card" data-testid={`settings-provider-${profile.id}`}>
              <div className="settings-row settings-provider-row">
                <div className="settings-row-main">
                  <div className="settings-provider-heading">
                    <strong>{profile.label}</strong>
                    <span className={`settings-key-dot ${profile.hasApiKey ? "is-saved" : "is-missing"}`} role="img"
                      aria-label={profile.hasApiKey ? "Credential saved" : "No credential saved"}
                      title={profile.hasApiKey ? "Credential saved" : "No credential saved"} />
                    {profile.kind === "openai-compatible" && <span className="settings-custom">Custom</span>}
                    {active && <span className="settings-active">Active</span>}
                  </div>
                  <p className="settings-row-desc">{providerName(profile.kind)}, {profile.defaultModel}</p>
                  {!profile.hasApiKey && <p className="settings-row-warning">No API key saved.</p>}
                  {result && <p className={`settings-provider-test ${result.ok ? "" : "settings-test-error"}`} role="status">
                    {result.ok ? `Model catalog available, ${result.modelCount} models` : `Model catalog check failed: ${result.error}`}</p>}
                </div>
                <div className="settings-row-control">
                  <Button variant="ghost" size="sm" type="button" className="secondary" aria-label={`Configure ${profile.label}`}
                    disabled={props.busy} onClick={() => startEdit(profile)}>
                    Configure<ChevronRight size={13} aria-hidden="true" /></Button>
                </div>
              </div>
            </li>;
          })}
        </ul>
        {providerRowCount === 0 && <p className="settings-empty-note">
          {normalizedQuery.length > 0 ? "No providers match this search."
            : "No providers yet. Add one to run Goals."}</p>}
      </>}
  </>;

  const appearance = props.appearance;
  const appearanceContent = appearance === undefined ? null : <>
    <h3 className="settings-page-title">Appearance</h3>
    <p className="settings-page-sub">Display preferences for this browser. They apply immediately.</p>
    <SettingsGroup label="Layout" />
    <SettingsRow title="Activity width" titleId={`${widthId}-label`}
      description="Applies to Activity and the message composer in this browser.">
      <RadioGroup className="settings-segmented" aria-labelledby={`${widthId}-label`} value={appearance.activityWidth}
        onValueChange={value => {
          if (value === "standard" || value === "wide") appearance.onActivityWidthChange(value);
        }}>
        <RadioGroupItem value="standard">Standard</RadioGroupItem>
        <RadioGroupItem value="wide">Wide</RadioGroupItem>
      </RadioGroup>
    </SettingsRow>
    {appearance.saveError !== undefined && <p className="settings-row-warning" role="alert">{appearance.saveError}</p>}
  </>;

  const doneFooter = props.onClose === undefined ? undefined
    : <><span className="settings-foot-spacer" /><Button variant="ghost" size="sm" type="button" className="secondary"
      onClick={props.onClose}>Done</Button></>;

  const sections: readonly SettingsSectionDefinition[] = [
    {
      value: "providers",
      label: "Providers",
      matchCount: view.kind === "list" ? (settings === undefined ? 1 : providerRowCount) : 1,
      searchable: view.kind === "list",
      content: view.kind === "list" ? providerList : providerForm,
      ...(view.kind === "list" ? (doneFooter === undefined ? {} : { footer: doneFooter }) : { footer: formFooter }),
    },
    ...(appearanceContent === null ? [] : [{
      value: "appearance",
      label: "Appearance",
      matchCount: matches("activity width standard wide layout appearance display") ? 1 : 0,
      searchable: true,
      content: appearanceContent,
      ...(doneFooter === undefined ? {} : { footer: doneFooter }),
    }]),
  ];

  const matchingSections = normalizedQuery.length === 0 ? sections : sections.filter(candidate => candidate.matchCount > 0);
  const navSections = matchingSections.length === 0 ? sections : matchingSections;
  const activeSection = matchingSections.find(candidate => candidate.value === section) ?? matchingSections[0];

  return <SettingsLayout
    navSections={navSections}
    activeSection={activeSection}
    onSelectSection={selectSection}
    query={query}
    onQueryChange={setQuery}
    searchable={activeSection?.searchable ?? true}
  />;
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
  /** 关闭承载设置的外层弹窗。 */
  readonly onClose?: () => void;
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
      onClose={props.onClose}
      {...handlers}
    />
  );
}
