import React, { useLayoutEffect, useRef, useState } from "react";
import { useStdout } from "ink";

/**
 * 在 Inspector 与普通终端页面之间切换屏幕缓冲区。
 *
 * @remarks
 * 切换前先渲染空帧，让 Ink 在旧缓冲区清除动态内容并重置行数。
 * 执行页面保留主缓冲区的 scrollback；卸载时直接恢复终端，因为 Ink 的
 * write 在退出后不再接受写入。
 *
 * @example
 * ```tsx
 * <TerminalScreen alternate={snapshot.screen === "inspector"}>{screen}</TerminalScreen>
 * ```
 */
export function TerminalScreen({ alternate, children }: {
    readonly alternate: boolean;
    readonly children: React.ReactNode;
}): React.JSX.Element | null {
    const { stdout, write } = useStdout();
    const [active, setActive] = useState(false);
    const entered = useRef(false);
    const target = alternate && stdout.isTTY === true;

    useLayoutEffect(() => {
        if (active === target) return;
        write(target ? "\x1b[?1049h\x1b[2J\x1b[H" : "\x1b[0m\x1b[?1049l");
        entered.current = target;
        setActive(target);
    }, [active, target, write]);

    useLayoutEffect(() => () => {
        if (entered.current) {
            stdout.write("\x1b[0m\x1b[?1049l\x1b[?25h");
            entered.current = false;
        }
    }, [stdout]);

    return active === target ? <>{children}</> : null;
}
