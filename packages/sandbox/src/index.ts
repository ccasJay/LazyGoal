export {
    createWorkspaceSandbox,
    EXECUTION_ABORTED_ERROR_CODE,
    SandboxAbortedError,
    type DomainFailureMessages,
    type OutsideMessageRenderer,
    type RelativePathViolation,
    type SandboxAbortControl,
    type SandboxFailure,
    type SandboxResolveResult,
    type ValidateRelativePathOptions,
    type WorkspaceSandbox,
} from "./workspace-sandbox";

export {
    buildSeatbeltPolicy,
    buildProgramSeatbeltPolicy,
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    filterSandboxEnvironment,
    getSandboxProtectionStatus,
    isSeatbeltSupported,
    resolveGitProtectionPaths,
    SANDBOX_EXEC_PATH,
    type SandboxProtectionStatus,
    type SeatbeltPolicyOptions,
} from "./macos-seatbelt";

export {
    runProgramSandbox,
    programWorkerHash,
    ProgramSandboxAbortedError,
    type ProgramToolCall,
} from "./program-sandbox";

export {
    resolveEffectiveSandboxScope,
    type DerivedSandboxAccess,
    type EffectiveExtraFile,
    type EffectiveSandboxScope,
    type SandboxAccessRequest,
    type SandboxExecutionPlan,
    type SandboxFileAccessRequest,
    type SandboxNetworkAccessRequest,
} from "./capability";
