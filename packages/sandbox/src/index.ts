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
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    filterSandboxEnvironment,
    isSeatbeltSupported,
    resolveGitProtectionPaths,
    SANDBOX_EXEC_PATH,
    type SeatbeltPolicyOptions,
} from "./macos-seatbelt";
