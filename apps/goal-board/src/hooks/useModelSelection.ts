import { useCallback, useEffect, useState } from "react";
import type {
  BrowserGoalSession,
  BrowserModelCatalog,
  BrowserModelOption,
} from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
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
}: {
  session: BrowserGoalSession | null;
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
}) {
  const [modelPickerTarget, setModelPickerTarget] = useState<ModelPickerTarget | null>(null);
  const [currentModelCatalog, setCurrentModelCatalog] = useState<BrowserModelCatalog | null>(null);
  const [modelCatalogRefreshKey, setModelCatalogRefreshKey] = useState(0);
  const [modelPreferenceRetry, setModelPreferenceRetry] = useState<string | null>(null);

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
          await browserApi.setModelPreference(modelId);
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
        const result = await browserApi.selectModel(target.goalId, { runId: target.runId, modelId });
        setModelPreferenceRetry(result.defaultModelSaved ? null : modelId);
        onSetCommandError(
          result.defaultModelSaved ? null : "Model switched, but the new Goal default was not saved."
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
    ]
  );

  const retryModelPreference = useCallback(async () => {
    const modelId = modelPreferenceRetry;
    if (modelId === null) return;
    try {
      await browserApi.setModelPreference(modelId);
      setModelPreferenceRetry(null);
      onSetCommandError(null);
    } catch (error) {
      onSetCommandError(`Could not save the new Goal default: ${errorMessage(error)}`);
    }
  }, [modelPreferenceRetry, onSetCommandError]);

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

