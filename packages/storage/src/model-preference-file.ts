/** 工作区模型偏好文件的持久化 DTO。 */
export interface ModelPreferenceFile {
    readonly version: 1;
    /** @minLength 1 */
    readonly profileId?: string;
    /** @minLength 1 */
    readonly modelId: string;
}
