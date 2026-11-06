import type { FixtureScenario } from "../fixture-types";
import {
  boardEmptyScenario,
  boardErrorScenario,
  boardLoadingScenario,
  boardPopulatedScenario,
} from "./board-scenarios";
import { sessionWaitingScenario } from "./session-scenarios";
import { sessionCommandScenario } from "./session-command-scenario";
import { trajectoryScenario } from "./trajectory-scenarios";
import { settingsScenario } from "./settings-scenarios";

export * from "./board-scenarios";
export * from "./session-scenarios";
export * from "./session-command-scenario";
export * from "./trajectory-scenarios";
export * from "./settings-scenarios";

/** 全部预设场景集合。 */
export const allScenarios: Record<string, FixtureScenario> = {
  "board-populated": boardPopulatedScenario,
  "board-empty": boardEmptyScenario,
  "board-loading": boardLoadingScenario,
  "board-error": boardErrorScenario,
  "session-waiting": sessionWaitingScenario,
  "session-command": sessionCommandScenario,
  "trajectory-default": trajectoryScenario,
  "settings-default": settingsScenario,
};
