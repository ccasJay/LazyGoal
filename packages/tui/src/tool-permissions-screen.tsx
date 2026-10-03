import React from "react";
import { Box, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";

import type { UiToolPermissionsViewModel } from "./types";
import { ErrorLine } from "./error-line";

/**
 * 当前 Goal 与工作区授权管理页面。
 *
 * @remarks
 * 只显示可见授权摘要，不暴露完整输入或匹配摘要。选择一条授权即撤销该授权；
 * 后续相同操作将重新进入 Runtime 审批。
 *
 * @example
 * ```tsx
 * <ToolPermissionsScreen view={view} onRevoke={handleRevoke} onBack={handleBack} />
 * ```
 */
export function ToolPermissionsScreen({
    view,
    onRevoke,
    onBack,
}: {
    readonly view: UiToolPermissionsViewModel;
    readonly onRevoke: (grantId: string, scope: "goal" | "workspace", kind?: "tool" | "sandbox") => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
}): React.JSX.Element {
    useInput((_input, key) => {
        if (key.escape) void onBack();
    }, { isActive: !view.busy });

    const active = view.grants.filter((grant) => grant.status === "active");
    const options = active.map((grant) => {
        const desc = grant.kind === "sandbox"
            ? `${grant.toolId} (sandbox) · ${grant.inputDigest ? grant.inputDigest.slice(0, 12) : (grant.command ?? "input")}`
            : `${grant.toolId}${grant.targetPath === undefined ? "" : ` · ${grant.targetPath}`}`;
        return {
            label: `Revoke ${desc} · ${grant.scope === "goal" ? "This Goal" : "This project"}`,
            value: `${grant.kind ?? "tool"}:${grant.scope}:${grant.grantId}`,
        };
    });

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">Permissions for {view.goal.id}</Text>
            <Text>Only matching actions are allowed by these ongoing permissions.</Text>
            {view.error === undefined ? null : <ErrorLine error={view.error} />}
            {view.grants.length === 0 ? <Text dimColor>No permissions are saved for this Goal or project.</Text> : (
                <Box flexDirection="column">
                    {view.grants.map((grant) => (
                        <Text key={grant.grantId} color={grant.status === "active" ? "green" : "gray"}>
                            {grant.kind === "sandbox" ? `${grant.toolId} (sandbox: ${grant.inputDigest ? grant.inputDigest.slice(0, 12) : (grant.command ?? "input")})` : grant.toolId} · {grant.scope === "goal" ? "This Goal" : "This project"} · {grant.status}
                            {grant.targetPath === undefined ? "" : ` · ${grant.targetPath}`}
                            {grant.network === "all_outbound" ? " · network: all_outbound" : ""}
                        </Text>
                    ))}
                </Box>
            )}
            {options.length === 0 ? null : (
                <Box flexDirection="column">
                    <Text>Choose a permission to revoke:</Text>
                    <Select
                        isDisabled={view.busy}
                        options={options}
                        onChange={(value) => {
                            const parts = value.split(":");
                            const kind = parts[0] === "sandbox" ? "sandbox" : "tool";
                            const scope = parts[1];
                            const grantId = parts.slice(2).join(":");
                            if (scope === "goal" || scope === "workspace") void onRevoke(grantId, scope, kind);
                        }}
                    />
                </Box>
            )}
            <Text dimColor>Esc Back</Text>
        </Box>
    );
}
