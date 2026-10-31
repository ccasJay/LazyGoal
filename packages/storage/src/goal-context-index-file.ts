/** Goal Context Index 中阶段目录条目的文件表示。 */
export interface GoalStageEntryFile {
    readonly goalId: string;
    readonly runId: string;
    readonly stageId: string;
    readonly revision: number;
    readonly target: string;
    readonly status: "executing" | "accepted" | "rejected";
    readonly acceptanceCriteria: readonly string[];
    readonly summary?: string;
    readonly rejectionFeedback?: string;
    readonly source: {
        readonly firstSequence: number;
        readonly lastSequence: number;
        readonly eventIds: readonly string[];
    };
    readonly reason?: string;
}

/** Goal Context Index 中重要信息来源的文件表示。 */
export type GoalNoteSourceFile =
    | {
        readonly kind: "user_message";
        readonly messageId: string;
        readonly verbatimSnippet: string;
        readonly summary?: string;
    }
    | {
        readonly kind: "user_decision";
        readonly messageId?: string;
        readonly summary?: string;
    }
    | {
        readonly kind: "agent_decision";
        readonly actionId?: string;
        readonly summary?: string;
    };

/** Goal Context Index 中重要信息条目的文件表示。 */
export interface GoalNoteEntryFile {
    readonly goalId: string;
    readonly runId: string;
    readonly noteId: string;
    readonly revision: number;
    readonly category: "decision" | "user_emphasis";
    readonly content: string;
    readonly reason?: string;
    readonly stageId?: string;
    readonly source: GoalNoteSourceFile;
    readonly supersedesNoteId?: string;
}

/** Goal 级派生上下文索引快照的文件表示。 */
export interface GoalContextIndexSnapshotFile {
    readonly schemaVersion: 1;
    readonly goalId: string;
    readonly buildId: string;
    readonly sourceBoundaries: readonly {
        readonly runId: string;
        readonly committedThroughSequence: number;
    }[];
    readonly sourceDigest: string;
    readonly stages: readonly GoalStageEntryFile[];
    readonly notes: readonly GoalNoteEntryFile[];
    readonly createdAt: number;
}
