import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactElement } from "react";

import type {
  BrowserPermissionExemptionSummary,
  BrowserPermissionProfile,
} from "../../../packages/web-contracts/src/index";

const askProfile: BrowserPermissionProfile = {
  sandbox: "workspace-write",
  approvals: "on-request",
  reviewer: "user",
  writableRoots: [],
};

const autoProfile: BrowserPermissionProfile = {
  sandbox: "workspace-write",
  approvals: "on-request",
  reviewer: "auto_review",
  writableRoots: [],
};

const fullProfile: BrowserPermissionProfile = {
  sandbox: "danger-full-access",
  approvals: "never",
  reviewer: "user",
  writableRoots: [],
};

const readOnlyProfile: BrowserPermissionProfile = {
  sandbox: "read-only",
  approvals: "on-request",
  reviewer: "user",
  writableRoots: [],
};

async function render(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(element);
}

test("权限档位预设覆盖询问、自动审批、完全放行与只读自定义", async () => {
  const { PERMISSION_PRESET_OPTIONS, permissionPresetOf } = await import("../src/permission-profile");
  assert.deepEqual(PERMISSION_PRESET_OPTIONS.map((option) => option.id), ["ask", "auto", "full", "read-only"]);
  assert.deepEqual(PERMISSION_PRESET_OPTIONS.map((option) => option.profile), [
    askProfile, autoProfile, fullProfile, readOnlyProfile,
  ]);
  assert.equal(permissionPresetOf(readOnlyProfile)?.id, "read-only");
  assert.equal(permissionPresetOf({ ...readOnlyProfile, writableRoots: ["/tmp/shared"] }), undefined);
});

test("当前档位按三轴完整匹配预设，不把近似组合显示成已知档位", async () => {
  const { permissionPresetLabel, permissionAxisLabels } = await import("../src/permission-profile");
  assert.equal(permissionPresetLabel(autoProfile), "Approve for me");
  assert.equal(permissionPresetLabel(fullProfile), "Full access");
  assert.equal(permissionPresetLabel({ ...askProfile, writableRoots: ["/tmp/shared"] }), "Custom");
  assert.deepEqual(permissionAxisLabels(readOnlyProfile), {
    sandbox: "Read-only",
    approvals: "On request",
    reviewer: "You",
  });
  assert.deepEqual(permissionAxisLabels(fullProfile), {
    sandbox: "Full access",
    approvals: "Never",
    reviewer: "You",
  });
});

test("权限入口渲染四个档位并只标记服务端当前档位为选中", async () => {
  const React = await import("react");
  const { PermissionPresetOptions } = await import("../src/components/PermissionControl");

  const html = await render(
    React.createElement(PermissionPresetOptions, {
      profile: autoProfile,
      profileError: null,
      profileBusy: false,
      onChoosePreset: () => {},
    }),
  );

  assert.match(html, /Ask for approval/);
  assert.match(html, /Approve for me/);
  assert.match(html, /Full access/);
  assert.match(html, /Read-only/);
  assert.equal((html.match(/ selected"/g) ?? []).length, 1);
  assert.match(html, / selected" for="permission-preset-auto"/);
  assert.match(html, /id="permission-preset-read-only"/);
  assert.match(html, /aria-checked="true"/);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
});

test("只读自定义档位展示真实三轴取值且不提供写权限", async () => {
  const React = await import("react");
  const { PermissionAxisSummary } = await import("../src/components/PermissionControl");

  const html = await render(React.createElement(PermissionAxisSummary, { profile: readOnlyProfile }));

  assert.match(html, /Sandbox<\/dt><dd>Read-only<\/dd>/);
  assert.match(html, /Approvals<\/dt><dd>On request<\/dd>/);
  assert.match(html, /Reviewer<\/dt><dd>You<\/dd>/);
  assert.equal(html.includes("Writable roots"), false);
});

test("档位冲突展示服务端当前值与 revision，并保留可重试的档位选择", async () => {
  const React = await import("react");
  const { PermissionPanel } = await import("../src/components/PermissionControl");
  const { describePermissionProfileFailure } = await import("../src/permission-profile");

  const message = describePermissionProfileFailure("conflict", { profile: autoProfile, revision: 4 });
  assert.match(message, /The current value is Approve for me \(revision 4\)/);
  assert.match(message, /Choose a permission again to retry/);

  const html = await render(
    React.createElement(PermissionPanel, {
      profile: autoProfile,
      profileError: message,
      profileBusy: false,
      onChoosePreset: () => {},
      exemptions: [],
      exemptionsLoading: false,
      exemptionsError: null,
      hasGoal: true,
      revokingExemptionId: null,
      onRevokeExemption: () => {},
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /The current value is Approve for me/);
  assert.match(html, /Sandbox<\/dt><dd>Workspace write<\/dd>/);
  assert.match(html, /Reviewer<\/dt><dd>Automatic review<\/dd>/);
  assert.equal((html.match(/ selected"/g) ?? []).length, 1);
  assert.match(html, / selected" for="permission-preset-auto"/);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
});

test("豁免面板展示真实网络范围、路径、读写方向与状态", async () => {
  const React = await import("react");
  const { PermissionPanel } = await import("../src/components/PermissionControl");

  const exemptions: readonly BrowserPermissionExemptionSummary[] = [
    {
      id: "exemption-network",
      scope: "workspace",
      network: "all_outbound",
      extraFiles: [],
      status: "active",
    },
    {
      id: "exemption-write",
      scope: "goal",
      network: "none",
      extraFiles: [
        { canonicalPath: "/tmp/shared", access: "write", kind: "directory_tree" },
        { canonicalPath: "/tmp/input.json", access: "read", kind: "file" },
      ],
      status: "active",
    },
    {
      id: "exemption-pending",
      scope: "goal",
      network: "none",
      extraFiles: [],
      status: "pending",
    },
  ];

  const html = await render(
    React.createElement(PermissionPanel, {
      profile: askProfile,
      profileError: null,
      profileBusy: false,
      onChoosePreset: () => {},
      exemptions,
      exemptionsLoading: false,
      exemptionsError: null,
      hasGoal: true,
      revokingExemptionId: null,
      onRevokeExemption: () => {},
    }),
  );

  assert.match(html, /Any outbound network access, including loopback/);
  assert.match(html, /No outbound network access/);
  assert.match(html, /This Project, Active/);
  assert.match(html, /This Goal, Active/);
  assert.match(html, /This Goal, Pending/);
  assert.match(html, /Write \/tmp\/shared \(directory tree\)/);
  assert.match(html, /Read \/tmp\/input\.json/);
  assert.equal((html.match(/>Revoke</g) ?? []).length, 2);
});

test("撤销豁免结果从控制收据中取出更新后的列表", async () => {
  const { exemptionsOf, permissionProfileOf } = await import("../src/control/results");

  const revoked = exemptionsOf({
    kind: "exemption_revoke",
    result: { ok: true, goalId: "goal-1", runId: "run-1", exemptions: [] },
  });
  assert.deepEqual(revoked, []);

  assert.equal(exemptionsOf({
    kind: "exemption_revoke",
    result: { ok: false, error: "stale_run" },
  }), undefined);
  assert.equal(exemptionsOf({
    kind: "permission_profile",
    result: {
      ok: true,
      profile: askProfile,
      revision: 2,
    },
  }), undefined);
  assert.deepEqual(permissionProfileOf({
    kind: "permission_profile",
    result: { ok: true, profile: askProfile, revision: 2 },
  }), { ok: true, profile: askProfile, revision: 2 });
});

test("权限入口不再出现 Tool 级授权字段", async () => {
  const React = await import("react");
  const { PermissionPanel } = await import("../src/components/PermissionControl");

  const html = await render(
    React.createElement(PermissionPanel, {
      profile: askProfile,
      profileError: null,
      profileBusy: false,
      onChoosePreset: () => {},
      exemptions: [{
        id: "exemption-1",
        scope: "goal",
        network: "none",
        extraFiles: [{ canonicalPath: "/tmp/shared", access: "write", kind: "file" }],
        status: "active",
      }],
      exemptionsLoading: false,
      exemptionsError: null,
      hasGoal: true,
      revokingExemptionId: null,
      onRevokeExemption: () => {},
    }),
  );

  for (const retired of ["toolId", "digest", "targetPath", "Saved permissions", "Auto-approve", "Ask when needed"]) {
    assert.equal(html.includes(retired), false, `permission entry must not render ${retired}`);
  }
});
