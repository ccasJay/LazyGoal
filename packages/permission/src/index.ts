export type {
    ActionRef,
    ApprovalPolicy,
    ApprovalReviewer,
    EffectiveExtraFile,
    EffectiveSandboxReview,
    EffectiveSandboxScope,
    GrantRef,
    GrantStatus,
    PermissionExemptionService,
    PermissionExemptionSummary,
    PermissionProfile,
    PermissionScope,
    ProjectPermissionProfile,
    ProjectPermissionProfileStore,
    SandboxAuthorizationContext,
    SandboxAuthorizationDecision,
    SandboxGrant,
    SandboxGrantLookup,
    SandboxGrantMatcher,
    SandboxGrantScope,
    SandboxGrantStore,
    SandboxMode,
} from "./types";

export {
    PermissionProfileConflictError,
} from "./types";

export {
    evaluateSandboxAuthorization,
    NETWORK_ALL_OUTBOUND_NOTICE,
} from "./sandbox-authorization";

export {
    computeInputDigest,
    createSandboxGrantMatcher,
    matchesSandboxGrant,
    matchesSandboxGrantMatcher,
} from "./grant-matching";

export {
    DefaultPermissionExemptionService,
} from "./permission-exemption-service";

export {
    DEFAULT_PERMISSION_PROFILE,
    PERMISSION_PRESETS,
} from "./permission-profile";

export {
    evaluatePermissionBoundary,
    isDestructiveCommand,
    type PermissionBoundaryDecision,
    type PermissionBoundaryRequest,
    type PermissionRiskClass,
} from "./permission-boundary";
