import type {
  BrowserModelCatalog,
  BrowserPermissionProfileResult,
  BrowserProviderSettings,
  BrowserWorkspaceContext,
} from "../../../../../packages/web-contracts/src/index";
import type { FixtureScenario } from "../fixture-types";

const settingsProviders: BrowserProviderSettings = {
  activeProfileId: "prof-openai",
  profiles: [
    {
      id: "prof-openai",
      label: "OpenAI GPT-4o",
      kind: "openai",
      defaultModel: "gpt-4o",
      hasApiKey: true,
      apiKeyMask: "sk-...1234",
    },
    {
      id: "prof-gemini",
      label: "Google Gemini 2.5",
      kind: "gemini",
      defaultModel: "gemini-2.5-pro",
      hasApiKey: true,
      apiKeyMask: "AIza...5678",
    },
  ],
};

const settingsModels: BrowserModelCatalog = {
  provider: "openai",
  currentModelId: "gpt-4o",
  models: [
    {
      id: "gpt-4o",
      displayName: "OpenAI GPT-4o (Production)",
      availabilitySource: "configured",
      metadataSource: "configured",
      selectable: true,
    },
    {
      id: "gpt-4o-mini",
      displayName: "OpenAI GPT-4o Mini",
      availabilitySource: "configured",
      metadataSource: "configured",
      selectable: true,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Google Gemini 2.5 Pro",
      availabilitySource: "configured",
      metadataSource: "configured",
      selectable: true,
    },
  ],
};

const settingsPermissionProfile: BrowserPermissionProfileResult = {
  ok: true,
  profile: {
    sandbox: "workspace-write",
    approvals: "on-request",
    reviewer: "user",
    writableRoots: [],
  },
  revision: 1,
};

/** 具有配置 Providers 与模型的 Settings 场景。 */
export const settingsScenario: FixtureScenario = {
  id: "settings-default",
  description: "Settings view with active OpenAI and Gemini profiles",
  workspace: {
    data: {
      workspaceRoot: "/Users/dev/project/lazygoal",
      worktreeRoot: null,
      branch: "main",
    },
  },
  permissionProfile: {
    data: settingsPermissionProfile,
  },
  providerSettings: {
    data: settingsProviders,
  },
  models: {
    data: settingsModels,
  },
};
