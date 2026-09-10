import assert from "node:assert/strict";
import { test } from "node:test";

import type {
    AcpClientInput,
    AcpClientResult,
    AcpPromptContent,
    AcpPromptResult,
    AcpSession,
    AcpSessionFactory,
    AcpSessionInput,
    AcpStopReason,
} from "../src/index.js";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Assert<Value extends true> = Value;

type _PromptContentIsRestricted = Assert<Equal<
    AcpPromptContent,
    { readonly type: "text"; readonly text: string }
        | { readonly type: "resource_link"; readonly uri: string; readonly name: string }
>>;
type _StopReasonIsSdkContract = Assert<Equal<AcpStopReason, "end_turn" | "max_turn_requests" | "cancelled" | "refusal" | "max_tokens">>;
type _SessionFactoryInputIsDocumented = Assert<Equal<
    Parameters<AcpSessionFactory["create"]>[0],
    AcpSessionInput
>>;
type _PromptResultIsReturnedBySession = Assert<
    Awaited<ReturnType<AcpSession["prompt"]>> extends AcpPromptResult ? true : false
>;
type _ClientResultCarriesSession = Assert<Equal<
    AcpClientResult["sessionId"],
    string
>>;

test("ACP public contract exposes only the reusable protocol boundary", () => {
    const input = null as unknown as AcpClientInput;
    assert.equal(typeof input, "object");
});
