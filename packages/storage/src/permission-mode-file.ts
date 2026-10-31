/** 项目权限模式文件的持久化 DTO。 */
export interface PermissionModeFile {
    readonly version: 1;
    /** @minLength 1 */
    readonly workspaceId: string;
    readonly mode: "default" | "yolo";
    /**
     * @asType integer
     * @minimum 0
     */
    readonly revision: number;
}
