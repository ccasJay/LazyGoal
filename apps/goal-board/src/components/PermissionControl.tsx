import React from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Check, ChevronDown, Eye, Shield, ShieldCheck, Zap } from "lucide-react";
import type {
  BrowserPermissionExemptionSummary,
  BrowserPermissionProfile,
} from "../../../../packages/web-contracts/src/index";
import {
  PERMISSION_PRESET_OPTIONS,
  permissionAxisLabels,
  permissionExemptionStatusLabel,
  permissionExtraFileLabel,
  permissionNetworkLabel,
  permissionPresetLabel,
  permissionPresetOf,
  type PermissionPresetId,
} from "../permission-profile";

/** 档位单选与展示共用的属性。 */
interface PermissionPresetProps {
  /** 服务端当前生效的档位；尚未读取到时为 `null`。 */
  readonly profile: BrowserPermissionProfile | null;
  /** 是否有档位提交正在等待受理，期间禁用单选项。 */
  readonly profileBusy: boolean;
  /** 选择档位时提交完整三轴取值。 */
  readonly onChoosePreset: (profile: BrowserPermissionProfile) => void;
}

/** 权限入口共用的展示属性；按钮与展开面板读取同一份服务端档位。 */
interface PermissionDisplayProps extends PermissionPresetProps {
  /** 档位提交失败或读取失败的说明；无失败时为 `null`。 */
  readonly profileError: string | null;
}

/**
 * 权限档位入口。
 *
 * @remarks
 * 按钮展示当前档位名称；展开后以单选列出可选档位，并展示服务端真实的三轴取值与
 * 仍在生效的边界豁免。档位值只来自服务端读取结果，提交失败时保留服务端值而不是
 * 假装已切换。
 *
 * @example
 * ```tsx
 * <PermissionControl open={open} profile={profile} profileError={null} profileBusy={false}
 *   onChoosePreset={choose} exemptions={[]} exemptionsLoading={false} exemptionsError={null}
 *   hasGoal revokingExemptionId={null} onRevokeExemption={revoke}
 *   onToggle={toggle} onClose={close} />
 * ```
 */
export function PermissionControl({
  open,
  onToggle,
  onClose,
  profile,
  profileError,
  profileBusy,
  onChoosePreset,
  exemptions,
  exemptionsLoading,
  exemptionsError,
  hasGoal,
  revokingExemptionId,
  onRevokeExemption,
}: PermissionDisplayProps & {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  exemptions: readonly BrowserPermissionExemptionSummary[];
  exemptionsLoading: boolean;
  exemptionsError: string | null;
  hasGoal: boolean;
  revokingExemptionId: string | null;
  onRevokeExemption: (exemption: BrowserPermissionExemptionSummary) => void;
}) {
  const label = profile === null ? null : permissionPresetLabel(profile);
  return (
    <Popover open={open} onOpenChange={next => { if (next !== open) next ? onToggle() : onClose(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm"
          type="button"
          className={`permission-trigger${profile?.sandbox === "danger-full-access" ? " wide-open" : ""}`}
          aria-expanded={open}
          aria-label={label === null ? "Permission" : `Permission: ${label}`}
        >
          <Shield size={13} aria-hidden="true" />
          <span>{label === null ? "Permission" : <><span className="permission-label-prefix">Permission: </span>{label}</>}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="permission-popover" aria-label="Project permissions">
        <PermissionPanel
          profile={profile}
          profileError={profileError}
          profileBusy={profileBusy}
          onChoosePreset={onChoosePreset}
          exemptions={exemptions}
          exemptionsLoading={exemptionsLoading}
          exemptionsError={exemptionsError}
          hasGoal={hasGoal}
          revokingExemptionId={revokingExemptionId}
          onRevokeExemption={onRevokeExemption}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * 权限弹层内容：档位选择、三轴取值与边界豁免。
 *
 * @remarks
 * 拆出以便独立渲染与验收；不读取或保存档位，所有值来自属性。
 *
 * @example
 * ```tsx
 * <PermissionPanel profile={profile} profileError={null} profileBusy={false}
 *   onChoosePreset={choose} exemptions={[]} exemptionsLoading={false}
 *   exemptionsError={null} hasGoal revokingExemptionId={null} onRevokeExemption={revoke} />
 * ```
 */
export function PermissionPanel({
  profile,
  profileError,
  profileBusy,
  onChoosePreset,
  exemptions,
  exemptionsLoading,
  exemptionsError,
  hasGoal,
  revokingExemptionId,
  onRevokeExemption,
}: PermissionDisplayProps & {
  exemptions: readonly BrowserPermissionExemptionSummary[];
  exemptionsLoading: boolean;
  exemptionsError: string | null;
  hasGoal: boolean;
  revokingExemptionId: string | null;
  onRevokeExemption: (exemption: BrowserPermissionExemptionSummary) => void;
}) {
  return (
    <>
      <PermissionPresetOptions profile={profile} profileBusy={profileBusy} onChoosePreset={onChoosePreset} />
      {profile !== null && <PermissionAxisSummary profile={profile} />}
      {profileError && (
        <p className="permission-error" role="alert">
          {profileError}
        </p>
      )}
      <Collapsible className="permission-exemptions" defaultOpen>
        <CollapsibleTrigger>
          Permission exemptions{exemptions.length > 0 ? ` (${exemptions.length})` : ""}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="permission-exemptions-content">
            {!hasGoal ? (
              <p>Select a Goal to review or revoke its permission exemptions.</p>
            ) : exemptionsLoading ? (
              <p>Loading exemptions…</p>
            ) : exemptionsError ? (
              <p className="permission-error" role="alert">
                {exemptionsError}
              </p>
            ) : exemptions.length === 0 ? (
              <p>No out-of-boundary access is allowed right now.</p>
            ) : (
              <ul>
                {exemptions.map((exemption) => (
                  <li key={exemption.id}>
                    <div className="permission-exemption-copy">
                      <strong>
                        <Shield size={13} aria-hidden="true" />
                        {permissionNetworkLabel(exemption.network)}
                      </strong>
                      <span>
                        {`${exemption.scope === "goal" ? "This Goal" : "This Project"}, ${permissionExemptionStatusLabel(exemption.status)}`}
                      </span>
                      {exemption.extraFiles.map((file) => (
                        <code key={`${file.access}:${file.canonicalPath}`}>{permissionExtraFileLabel(file)}</code>
                      ))}
                    </div>
                    {exemption.status === "active" && (
                      <Button variant="ghost" size="sm"
                        type="button"
                        className="permission-revoke"
                        disabled={revokingExemptionId !== null}
                        aria-label={`Revoke ${exemption.scope === "goal" ? "Goal" : "project"} permission exemption`}
                        onClick={() => onRevokeExemption(exemption)}
                      >
                        {revokingExemptionId === exemption.id ? "Revoking…" : "Revoke"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

/** 受控档位单选；由 RadioGroup 统一处理键盘与单选语义，不自行保存档位。 */
export function PermissionPresetOptions({
  profile,
  profileBusy,
  onChoosePreset,
}: PermissionPresetProps) {
  const selected = profile === null ? undefined : permissionPresetOf(profile);
  return (
    <RadioGroup className="permission-modes" name="project-permission-preset" aria-label="Permission level"
      value={selected?.id ?? ""}
      onValueChange={(value) => {
        const option = PERMISSION_PRESET_OPTIONS.find((candidate) => candidate.id === value);
        if (option !== undefined) onChoosePreset(option.profile);
      }}
      disabled={profileBusy || profile === null}
    >
      {PERMISSION_PRESET_OPTIONS.map((option) => (
        <Label className={selected?.id === option.id ? "selected" : ""} htmlFor={`permission-preset-${option.id}`} key={option.id}>
          <RadioGroupItem id={`permission-preset-${option.id}`} value={option.id} />
          {presetIcon(option.id)}
          <span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </span>
          {selected?.id === option.id && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
        </Label>
      ))}
    </RadioGroup>
  );
}

/**
 * 当前档位的三轴真实取值。
 *
 * @remarks
 * 展示服务端返回的 `sandbox`、`approvals` 与 `reviewer`；非空 `writableRoots` 单独列出，
 * 避免入口只显示档位名称而隐藏实际放行范围。
 *
 * @example
 * ```tsx
 * <PermissionAxisSummary profile={profile} />
 * ```
 */
export function PermissionAxisSummary({ profile }: { profile: BrowserPermissionProfile }) {
  const axes = permissionAxisLabels(profile);
  return (
    <dl className="permission-axes" aria-label="Effective permission values">
      <div><dt>Sandbox</dt><dd>{axes.sandbox}</dd></div>
      <div><dt>Approvals</dt><dd>{axes.approvals}</dd></div>
      <div><dt>Reviewer</dt><dd>{axes.reviewer}</dd></div>
      {profile.writableRoots.length > 0 && (
        <div>
          <dt>Writable roots</dt>
          <dd>{profile.writableRoots.map((root) => <code key={root}>{root}</code>)}</dd>
        </div>
      )}
    </dl>
  );
}

function presetIcon(id: PermissionPresetId) {
  switch (id) {
    case "ask": return <Shield size={16} aria-hidden="true" />;
    case "auto": return <ShieldCheck size={16} aria-hidden="true" />;
    case "full": return <Zap size={16} aria-hidden="true" />;
    case "read-only": return <Eye size={16} aria-hidden="true" />;
  }
}
