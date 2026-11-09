import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import { readTriggerWireRequest } from "../../../../packages/storage/src/trigger-delivery-file";
import { receiveAuthorizedTrigger, type TriggerIngressPrincipal } from "../../../../packages/storage/src/trigger-delivery-ingress";
import { TriggerDeliveryStore } from "../../../../packages/storage/src/trigger-delivery-store";
import { SupervisorOwnership } from "../../../../packages/storage/src/supervisor-ownership";

const MAX_REQUEST_BYTES = 1024 * 1024;

/**
 * 本地 Trigger 连接的进程身份和凭据登记。
 *
 * @remarks
 * 宿主为每次进程代次单独发放随机密钥，并在进程退出或授权撤销后注销。密钥只
 * 保留在内存中，不写入收据或诊断。创建凭据不授予超出 principal 的 Goal 权限。
 *
 * @example
 * ```ts
 * const credentials = new TriggerCredentials();
 * const secret = credentials.issue(principal);
 * credentials.revoke(secret);
 * ```
 */
export class TriggerCredentials {
    private readonly principals = new Map<string, TriggerIngressPrincipal>();

    /** @returns 可通过可信通道交给该进程的随机密钥。 */
    issue(principal: TriggerIngressPrincipal): string {
        const secret = randomBytes(32).toString("base64url");
        this.principals.set(digest(secret), structuredClone(principal));
        return secret;
    }

    /** 吊销凭据；已吊销的凭据不能再提交投递。 */
    revoke(secret: string): void { this.principals.delete(digest(secret)); }

    /** @returns 已登记的可信身份；密钥无效时返回 undefined。 */
    resolve(secret: string): TriggerIngressPrincipal | undefined { return this.principals.get(digest(secret)); }
}

function digest(secret: string): string { return createHash("sha256").update(secret).digest("hex"); }

/**
 * 创建只在 loopback 接收单条 JSON Trigger 投递的本地服务。
 *
 * @remarks
 * 服务只监听 IPv4 loopback，宿主负责关闭及分发真实连接凭据。每个连接在写入一个 JSON 对象后关闭
 * 写入端，服务返回一个 JSON 对象并关闭连接。结构、凭据、来源及目标授权全部
 * 验证通过后才保存收据；错误响应不包含输入或凭据。此服务不执行 Goal 准入或派发。
 *
 * @param owner - 此工作区当前 Supervisor 的所有权。
 * @param store - 同一工作区的投递存储。
 * @param credentials - 由宿主维护的可信连接身份登记。
 * @returns 已监听 loopback 随机端口的服务；调用方负责关闭。
 * @example
 * ```ts
 * const server = await startTriggerWireServer(owner, store, credentials);
 * ```
 */
export async function startTriggerWireServer(owner: SupervisorOwnership, store: TriggerDeliveryStore, credentials: TriggerCredentials): Promise<Server> {
    const server = createServer({ allowHalfOpen: true }, (socket) => receive(socket, owner, store, credentials));
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    return server;
}

function receive(socket: Socket, owner: SupervisorOwnership, store: TriggerDeliveryStore, credentials: TriggerCredentials): void {
    let bytes = 0;
    const chunks: Buffer[] = [];
    socket.on("error", () => { socket.destroy(); });
    socket.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_REQUEST_BYTES) { socket.destroy(); return; }
        chunks.push(chunk);
    });
    socket.on("end", () => {
        void owner.run(async () => {
            try {
                const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                const request = readTriggerWireRequest(raw);
                if (request === undefined) throw new Error("Invalid request");
                const principal = credentials.resolve(request.secret);
                if (principal === undefined) throw new Error("Invalid credential");
                const result = receiveAuthorizedTrigger(store, { deliveryId: request.trigger.id, trigger: request.trigger }, principal);
                socket.end(JSON.stringify({ ok: true, result }));
            } catch {
                socket.end(JSON.stringify({ ok: false, error: "Trigger delivery rejected" }));
            }
        }).catch(() => { socket.end(JSON.stringify({ ok: false, error: "Supervisor unavailable" })); });
    });
}
