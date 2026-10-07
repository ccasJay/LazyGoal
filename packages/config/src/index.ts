export {
    ensureSecureConfigFile,
    ensureSecureHomeDirectories,
    ensureSecureWorkspaceDirectories,
    ensureWorkspaceManifest,
    LazyGoalHomeConfigurationError,
    resolveLazyGoalHomePaths,
    resolveWorkspaceHomePaths,
    WorkspaceManifestProtocolError,
} from "./home";
export type {
    LazyGoalHomePaths,
    WorkspaceHomePaths,
    WorkspaceManifest,
} from "./home";
