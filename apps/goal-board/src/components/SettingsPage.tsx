import { SlidersHorizontal } from "lucide-react";

/**
 * 设置页的展示框架；当前没有配置项、保存操作或配置 API 调用。
 *
 * @example
 * ```tsx
 * <SettingsPage />
 * ```
 */
export function SettingsPage() {
  return (
    <section className="settings-page" aria-labelledby="settings-page-title">
      <div className="settings-page-inner">
        <header className="settings-page-heading">
          <h2 id="settings-page-title">Workspace settings</h2>
          <p>A place for your LazyGoal preferences.</p>
        </header>
        <div className="settings-empty">
          <SlidersHorizontal size={26} strokeWidth={1.5} aria-hidden="true" />
          <h3>No settings available yet</h3>
          <p>Settings will appear here as they become available.</p>
        </div>
      </div>
    </section>
  );
}
