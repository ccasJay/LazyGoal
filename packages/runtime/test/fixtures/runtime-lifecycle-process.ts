import { ManagedResourceRegistry, RuntimeLifecycle } from "../../src/index";
import { CheckpointGateGoalStore } from "../../src/index";
import { InMemoryGoalStore } from "../../../storage/src/index";

/**
 * 受控子进程探针：关闭实例后宿主仍应继续运行并正常结束。
 *
 * 输出标记供父测试断言：
 *   - `pre-close:<state>:<closeCalls>`
 *   - `post-close:<state>:<closeCalls>`
 *   - `host-alive`
 */
const resources = new ManagedResourceRegistry();
let closeCalls = 0;
resources.register({
    close() {
        closeCalls += 1;
    },
});

const lifecycle = new RuntimeLifecycle({
    checkpointStore: new CheckpointGateGoalStore(new InMemoryGoalStore()),
    resources,
    abortController: new AbortController(),
    gracePeriodMs: 50,
});

process.stdout.write(`pre-close:${lifecycle.state}:${closeCalls}\n`);

await lifecycle.close();

process.stdout.write(`post-close:${lifecycle.state}:${closeCalls}\n`);

// 关闭实例不结束宿主：继续执行普通异步工作后再正常退出。
await new Promise((resolve) => setTimeout(resolve, 5));
process.stdout.write("host-alive\n");
