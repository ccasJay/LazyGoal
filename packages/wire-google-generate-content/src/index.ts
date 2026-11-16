export { generateGenerateContent, streamGenerateContent, DEFAULT_GEMINI_BASE_URL } from "./client";
export type { GenerateContentConnection } from "./client";

export {
    GEMINI_ABSENT_SENTINEL,
    GEMINI_NULL_SENTINEL,
    prepareGeminiSchema,
    restoreGeminiResponseProjection,
    toGeminiWireSchema,
} from "./schema";

export { buildGenerateContentRequest, toGenerateContents } from "./request";
export type {
    GenerateContentContent,
    GenerateContentPart,
    GenerateContentRequestBody,
    GenerateContentRequestOptions,
} from "./request";

export { GenerateContentStreamAssembler, toGenerateContentResponse } from "./events";
export type { GenerateContentResponseOptions } from "./events";

export { GeminiIncompleteResponseError } from "./errors";
