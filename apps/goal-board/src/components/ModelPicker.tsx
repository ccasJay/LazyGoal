import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
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

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const goalTarget = target.kind === "goal" ? { goalId: target.goalId, runId: target.runId } : undefined;
    void browserApi.listModels(goalTarget, controller.signal).then((result) => {
      if (!controller.signal.aborted && mounted.current) setCatalog(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && mounted.current) setError(errorMessage(failure));
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [target.kind, target.kind === "goal" ? target.goalId : undefined, target.kind === "goal" ? target.runId : undefined]);

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
          <p>Models available from the current provider</p>
        </div>
        <button className="icon" type="button" aria-label="Close model picker" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {catalog !== null && <p className="model-provider">Configured provider · {catalog.provider}</p>}
      {catalog === null && error === null && (
        <p className="model-loading">
          <span className="loading-mark small" /> Loading models…
        </p>
      )}
      {error !== null && <p className="model-error" role="alert">{error}</p>}
      <input
        id="model-picker-search"
        name="search"
        className="model-search"
        data-modal-autofocus
        type="search"
        aria-label="Search models"
        placeholder="Search models…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {catalog !== null && (
        <div className="model-list">
          {catalog.models
            .filter((model) => `${model.displayName} ${model.id}`.toLowerCase().includes(search.toLowerCase()))
            .map((model) => {
              const current = (selectedId ?? catalog.currentModelId) === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`model-option ${current ? "current" : ""}`}
                  disabled={!model.selectable || busyId !== null}
                  onClick={() => void pick(model)}
                >
                  <span className="model-option-main">
                    <strong>{model.displayName}</strong>
                    <code>{model.id}</code>
                  </span>
                  <span className="model-option-meta">
                    {current && (
                      <span className="model-current">
                        <Check size={12} /> Current
                      </span>
                    )}
                    <span>
                      {model.availabilitySource === "live"
                        ? "Live"
                        : model.availabilitySource === "catalog"
                        ? "Catalog fallback"
                        : "Configured"}
                    </span>
                    {model.contextWindowTokens !== undefined && (
                      <span>{Math.round(model.contextWindowTokens / 1000)}k context</span>
                    )}
                    {!model.selectable && (
                      <span className="model-unavailable">{model.unavailableReason ?? "Unavailable"}</span>
                    )}
                  </span>
                </button>
              );
            })}
          {!catalog.models.some((model) =>
            `${model.displayName} ${model.id}`.toLowerCase().includes(search.toLowerCase())
          ) && <p className="model-empty">No models match this search.</p>}
        </div>
      )}
    </Modal>
  );
}

