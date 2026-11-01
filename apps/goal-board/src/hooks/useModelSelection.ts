import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowserControlIntentCommand,
  BrowserGoalSessionState,
  BrowserModelCatalog,
  BrowserModelOption,
} from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import { modelSelectionOutcomeOf } from "../control/model-selection";
import type { ControlIntents } from "./useControlIntents";
import { type ModelPickerTarget, errorMessage } from "../types";

export function useModelSelection({
  session,
  draftGoalId,
  draftGeneration,
  draftLoadVersion,
  draftModelId,
  setDraftModelCatalog,
  setDraftModelId,
  setDraftModelError,
  loadDraftDefault,
  onRefreshSession,
  onSetCommandError,
  control,
}: {
  session: BrowserGoalSessionState | null;
  draftGoalId: React.MutableRefObject<string | null>;
  draftGeneration: React.MutableRefObject<number>;
  draftLoadVersion: React.MutableRefObject<number>;
  draftModelId: string | null;
  setDraftModelCatalog: (catalog: BrowserModelCatalog | null) => void;
  setDraftModelId: (id: string | null) => void;
  setDraftModelError: (error: string | null) => void;
  loadDraftDefault: (generation: number) => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onSetCommandError: (error: string | null) => void;
  control: ControlIntents;
}) {
  const [modelPickerTarget, setModelPickerTarget] = useState<ModelPickerTarget | null>(null);
  const [currentModelCatalog, setCurrentModelCatalog] = useState<BrowserModelCatalog | null>(null);
  const [modelCatalogRefreshKey, setModelCatalogRefreshKey] = useState(0);
  const [modelPreferenceRetry, setModelPreferenceRetry] = useState<string | null>(null);
  /** 部分成功后重试所用的同一意图身份；不改写冻结载荷。 */
  const modelSelectionIntent = useRef<Extract<BrowserControlIntentCommand, { readonly kind: "model_selection" }> | null>(null);

  useEffect(() => {
    if (session === null) {
      setCurrentModelCatalog(null);
      return;
    }
    let active = true;
    setCurrentModelCatalog(null);
    void browserApi
      .listModels({ goalId: session.goalId, runId: session.currentRunId })
      .then((catalog) => {
        if (active) setCurrentModelCatalog(catalog);
      })
      .catch(() => {
        if (active) setCurrentModelCatalog(null);
      });
    return () => {
      active = false;
    };
  }, [session?.goalId, session?.currentRunId, modelCatalogRefreshKey]);

  useEffect(() => {
    if (
      modelPickerTarget?.kind === "goal" &&
      session !== null &&
      (session.goalId !== modelPickerTarget.goalId || session.currentRunId !== modelPickerTarget.runId)
    ) {
      setModelPickerTarget(null);
    }
  }, [session?.goalId, session?.currentRunId, modelPickerTarget]);

  const chooseModel = useCallback(
    async (
      target: ModelPickerTarget,
      model: BrowserModelOption,
      catalog: BrowserModelCatalog
    ): Promise<void> => {
      const modelId = model.id;
      if (target.kind === "draft") {
        if (draftGoalId.current !== null)
          throw new Error("Retry this Goal with its original model before changing it.");
        const generation = draftGeneration.current;
        draftLoadVersion.current += 1;
        try {
          await browserApi.setModelPreference(modelId, catalog.profileId);
        } catch (error) {
          if (generation === draftGeneration.current && draftModelId === null)
            void loadDraftDefault(generation);
          throw error;
        }
        if (generation !== draftGeneration.current) return;
        setDraftModelCatalog({ ...catalog, currentModelId: modelId, defaultModelNotice: undefined });
        setDraftModelId(modelId);
        setDraftModelError(null);
        return;
      }
      try {
        const intent: Extract<BrowserControlIntentCommand, { readonly kind: "model_selection" }> = {
          kind: "model_selection",
          intentId: crypto.randomUUID(),
          goalId: target.goalId,
          runId: target.runId,
          modelId,
          ...(catalog.profileId === undefined ? {} : { providerProfileId: catalog.profileId }),
          persistAsDefault: true,
        };
        modelSelectionIntent.current = intent;
        const receipt = await control.submit(intent);
        let outcome = modelSelectionOutcomeOf(receipt);
        if (outcome.kind === "unknown") {
          const verification = await control.verify(intent.intentId);
          if (verification !== "applied") {
            onSetCommandError("The model change result is unknown. Reload before trying again.");
            throw new Error("model_selection_unknown");
          }
          outcome = { kind: "applied", modelId, preference: "failed" };
        }
        if (outcome.kind === "rejected") {
          if (outcome.refresh && session?.goalId === target.goalId) {
            await onRefreshSession();
          }
          throw new BrowserApiError(outcome.error, 409, outcome.refresh);
        }
        const preferenceFailed = outcome.preference === "failed";
        setModelPreferenceRetry(preferenceFailed ? modelId : null);
        onSetCommandError(
          preferenceFailed ? "Model switched, but the new Goal default was not saved." : null
        );
        if (session?.goalId === target.goalId) {
          setModelCatalogRefreshKey((current) => current + 1);
          await onRefreshSession();
        }
      } catch (error) {
        if (error instanceof BrowserApiError && error.refresh && session?.goalId === target.goalId) {
          await onRefreshSession();
        }
        throw error;
      }
    },
    [
      session?.goalId,
      draftGoalId,
      draftGeneration,
      draftLoadVersion,
      draftModelId,
      loadDraftDefault,
      setDraftModelCatalog,
      setDraftModelId,
      setDraftModelError,
      onRefreshSession,
      onSetCommandError,
      control.submit,
      control.verify,
    ]
  );

  const retryModelPreference = useCallback(async () => {
    const intent = modelSelectionIntent.current;
    if (modelPreferenceRetry === null || intent === null) return;
    const receipt = await control.submit(intent);
    const outcome = modelSelectionOutcomeOf(receipt);
    if (outcome.kind === "rejected") {
      onSetCommandError(outcome.error === "model_switch_not_allowed"
        ? "The new Goal default was not saved: this Run can no longer change models."
        : `Could not save the new Goal default (${outcome.error}).`);
      return;
    }
    if (outcome.kind === "unknown") {
      onSetCommandError("Could not save the new Goal default. The result is unknown; retry the same command.");
      return;
    }
    if (outcome.preference === "saved") {
      setModelPreferenceRetry(null);
      onSetCommandError(null);
      return;
    }
    onSetCommandError("Could not save the new Goal default: the local service rejected the preference write.");
  }, [modelPreferenceRetry, control.submit, onSetCommandError]);

  return {
    modelPickerTarget,
    setModelPickerTarget,
    currentModelCatalog,
    modelPreferenceRetry,
    setModelPreferenceRetry,
    refreshModelCatalog: () => setModelCatalogRefreshKey((k) => k + 1),
    chooseModel,
    retryModelPreference,
  };
}

