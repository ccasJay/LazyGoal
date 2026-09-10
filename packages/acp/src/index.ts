export type {
    AcpAgentInput,
    AcpClientInput,
    AcpClientResult,
    AcpConnection,
    AcpContentBlock,
  AcpPromptContent,
  AcpPromptResult,
    AcpPromptControl,
    AcpPromptResourceLink,
    AcpPromptText,
    AcpSession,
    AcpSessionFactory,
    AcpSessionInput,
    AcpSessionUpdate,
    AcpStopReason,
    AcpStream,
} from "./contracts";

export { serveLazyGoalAcpAgent } from "./agent";
export { runLazyGoalAcpClient, runAcpClient } from "./client";

/** SDK 标准 JSON-RPC 错误；集成层负责 data 的安全内容与接收校验。 */
export { RequestError as AcpRequestError } from "@agentclientprotocol/sdk";
