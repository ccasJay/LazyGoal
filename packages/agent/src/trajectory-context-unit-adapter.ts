import type {
    TrajectoryEvent,
} from "../../runtime/src/index";
import {
    freezeTrajectoryEvent,
} from "../../runtime/src/index";
import type { ContextUnit, ContextUnitAdapter } from "./context-unit";

/**
 * 将事实型 Trajectory 映射为可整体裁剪的上下文单元。
 *
 * @remarks
 * 连续且拥有相同 `executionUnitId` 的事件组成一个单元；没有执行单元关联的
 * 生命周期、marker 或其它事件各自形成单独单元。适配器按事件顺序复制并冻结
 * 输入，不修改原始事件，也不会把结果自动加入任何 Prompt 请求。
 * `characterCount` 使用冻结事件 JSON 的 UTF-16 `length`，供通用 Compactor
 * 决定保留或丢弃完整执行单元。
 *
 * @example
 * ```ts
 * const adapter = new TrajectoryContextUnitAdapter();
 * const units = adapter.adapt(events);
 * const visible = await compactor.compact(units);
 * ```
 */
export class TrajectoryContextUnitAdapter implements ContextUnitAdapter<
    readonly TrajectoryEvent[],
    TrajectoryEvent
> {
    /**
     * @param source - 按序读取的不可变 Domain Events。
     * @returns 新建、冻结且按执行单元分组的上下文单元。
     * @throws 输入事件违反 Trajectory Envelope 协议时抛出协议错误。
     */
    adapt(
        source: readonly TrajectoryEvent[],
    ): readonly ContextUnit<TrajectoryEvent>[] {
        const units: ContextUnit<TrajectoryEvent>[] = [];
        let currentKey: string | undefined;
        let currentItems: TrajectoryEvent[] = [];

        const flush = (): void => {
            if (currentItems.length === 0) return;
            const items = Object.freeze([...currentItems]);
            units.push(Object.freeze({
                items,
                characterCount: JSON.stringify(items).length,
            }));
            currentItems = [];
        };

        for (const event of source) {
            const immutableEvent = freezeTrajectoryEvent(event) as TrajectoryEvent;
            const key = event.executionUnitId === undefined
                ? `event:${event.sequence}`
                : `execution:${event.executionUnitId}`;

            if (currentKey !== undefined && currentKey !== key) {
                flush();
            }

            currentKey = key;
            currentItems.push(immutableEvent);
        }

        flush();
        return Object.freeze(units);
    }
}
