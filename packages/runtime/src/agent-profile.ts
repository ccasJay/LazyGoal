
export interface AgentProfile {
    readonly id: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}


export interface AgentProfileRegistry {
    get(profileId: string): AgentProfile | undefined;
}