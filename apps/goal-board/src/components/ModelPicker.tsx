import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "./ui/command";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { NativeSelect } from "./ui/native-select";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import type {
  BrowserModelCatalog,
  BrowserModelOption,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { Modal } from "../modal";
import { type ModelPickerTarget, errorMessage } from "../types";

export function ModelPicker({
  target,
  selectedId,
  onSelect,
  onClose,
  onDone,
}: {
  target: ModelPickerTarget;
  selectedId: string | null;
  onSelect: (model: BrowserModelOption, catalog: BrowserModelCatalog) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [catalog, setCatalog] = useState<BrowserModelCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);
  const [search, setSearch] = useState("");
  const [sourceProfileId, setSourceProfileId] = useState<string | null | undefined>(undefined);
  const sourceInitialised = useRef(false);

  useEffect(() => {
    mounted.current = true;
    setCatalog(null);
    setError(null);
    const controller = new AbortController();
    const goalTarget = target.kind === "goal" ? { goalId: target.goalId, runId: target.runId } : undefined;
    void browserApi.listModels(
      {
        ...(goalTarget ?? {}),
        ...(sourceProfileId == null ? {} : { providerProfileId: sourceProfileId }),
      },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted || !mounted.current) return;
      setCatalog(result);
      if (!sourceInitialised.current) {
        sourceInitialised.current = true;
        if (result.profileId !== undefined && result.profileId !== sourceProfileId) setSourceProfileId(result.profileId);
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && mounted.current) setError(errorMessage(failure));
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [target.kind, target.kind === "goal" ? target.goalId : undefined, target.kind === "goal" ? target.runId : undefined, sourceProfileId]);

  const normalizedSearch = search.toLowerCase();
  const filteredModels = catalog?.models.filter((model) =>
    `${model.displayName} ${model.id}`.toLowerCase().includes(normalizedSearch)
  ) ?? [];
  const hasMultipleSources = catalog?.sources !== undefined && catalog.sources.length > 1;
  const resultCount = catalog === null
    ? null
    : filteredModels.length === catalog.models.length
    ? `${filteredModels.length} ${filteredModels.length === 1 ? "model" : "models"}`
    : `${filteredModels.length} of ${catalog.models.length} models`;

  async function pick(model: BrowserModelOption) {
    if (!model.selectable || busyId !== null) return;
    setBusyId(model.id);
    setError(null);
    try {
      if (catalog === null) return;
      await onSelect(model, catalog);
      if (mounted.current) onDone();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <Modal className="model-picker" label="Choose model" onClose={onClose}>
      <div className="model-picker-head">
        <div>
          <h2>Choose model</h2>
        </div>
        <Button variant="ghost" size="sm" className="icon" type="button" aria-label="Close model picker" onClick={onClose}>
          <X size={17} data-icon="inline-start" />
        </Button>
      </div>
      {catalog !== null && (
        <div className="model-picker-provider">
          {hasMultipleSources ? (
            <div className="model-provider-control">
              <Label htmlFor="model-picker-source">Provider</Label>
              <NativeSelect
                id="model-picker-source"
                aria-label="Choose provider"
                className="model-source-select"
                value={sourceProfileId === undefined ? catalog.profileId ?? "" : sourceProfileId ?? ""}
                onChange={(event) => setSourceProfileId(event.target.value.length === 0 ? null : event.target.value)}
              >
                {catalog.sources?.map((source) => (
                  <option key={source.profileId ?? "config"} value={source.profileId ?? ""}>
                    {source.label}{source.label === source.kind ? "" : `, ${source.kind}`}{source.active ? " (active)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="model-provider-summary">
              <span>Provider</span>
              <strong>{catalog.provider}</strong>
            </div>
          )}
        </div>
      )}
      <Command className="model-picker-command" shouldFilter={false} loop>
        <div className="model-picker-search">
          <CommandInput
            id="model-picker-search"
            name="search"
            className="model-search"
            data-modal-autofocus
            aria-label="Search models"
            placeholder="Search by name or model ID"
            value={search}
            onValueChange={setSearch}
          />
          {resultCount !== null && <span className="model-result-count" aria-live="polite">{resultCount}</span>}
        </div>
        {catalog === null ? (
          <div className="model-results-state" aria-live="polite" aria-busy="true">
            {error === null ? (
              <p className="model-loading"><span className="loading-mark small" /> Loading models…</p>
            ) : (
              <p className="model-error" role="alert">{error}</p>
            )}
          </div>
        ) : (
          <CommandList className="model-list">
            <CommandGroup className="model-options">
              {filteredModels.map((model) => {
                const current = (selectedId ?? catalog.currentModelId) === model.id;
                return (
                  <CommandItem
                    value={model.id}
                    key={model.id}
                    className={`model-option ${current ? "current" : ""}`}
                    disabled={!model.selectable || busyId !== null}
                    onSelect={() => void pick(model)}
                  >
                    <span className="model-option-check" aria-hidden="true">
                      {busyId === model.id ? <LoaderCircle className="model-option-progress" size={15} /> : current ? <Check size={15} /> : null}
                    </span>
                    <span className="model-option-main">
                      <strong>{model.displayName}</strong>
                      <code>{model.id}</code>
                      {!model.selectable && <span className="model-unavailable">{model.unavailableReason ?? "Unavailable"}</span>}
                    </span>
                    <span className="model-option-meta">
                      {current && <Badge className="model-current"><Check size={12} /> Current</Badge>}
                      <Badge variant="outline" className={`model-availability ${model.availabilitySource}`}>
                        {model.availabilitySource === "live"
                          ? "Live"
                          : model.availabilitySource === "catalog"
                          ? "Catalog"
                          : "Configured"}
                      </Badge>
                      {model.contextWindowTokens !== undefined && (
                        <span className="model-context-window">{Math.round(model.contextWindowTokens / 1000).toLocaleString()}k context</span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {filteredModels.length === 0 && <CommandEmpty className="model-empty">No models match this search.</CommandEmpty>}
          </CommandList>
        )}
      </Command>
    </Modal>
  );
}

