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
    readonly onRevoke: (grantId: string, scope: "goal" | "workspace") => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
}): React.JSX.Element {
    useInput((_input, key) => {
        if (key.escape) void onBack();
    }, { isActive: !view.busy });

    const active = view.grants.filter((grant) => grant.status === "active");
    const options = active.map((grant) => ({
        label: `Revoke ${grant.toolId} · ${grant.scope === "goal" ? "This Goal" : "This project"}${grant.targetPath === undefined ? "" : ` · ${grant.targetPath}`}`,
        value: `${grant.scope}:${grant.grantId}`,
    }));

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">Tool permissions for {view.goal.id}</Text>
            <Text>Only matching actions are allowed by these ongoing permissions.</Text>
            {view.error === undefined ? null : <ErrorLine error={view.error} />}
            {view.grants.length === 0 ? <Text dimColor>No permissions are saved for this Goal or project.</Text> : (
                <Box flexDirection="column">
                    {view.grants.map((grant) => (
                        <Text key={grant.grantId} color={grant.status === "active" ? "green" : "gray"}>
                            {grant.toolId} · {grant.scope === "goal" ? "This Goal" : "This project"} · {grant.status}
                            {grant.targetPath === undefined ? "" : ` · ${grant.targetPath}`}
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
                            const separator = value.indexOf(":");
                            const scope = value.slice(0, separator);
                            const grantId = value.slice(separator + 1);
                            if (scope === "goal" || scope === "workspace") void onRevoke(grantId, scope);
                        }}
                    />
                </Box>
            )}
            <Text dimColor>Esc Back</Text>
        </Box>
    );
}
